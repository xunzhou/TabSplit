const api = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_CONFIG = {
  minTabs: 2,
  splitByPath: ['atlassian.net'],
  ignoreDomains: [],
};

async function loadConfig() {
  const stored = await api.storage.sync.get('config');
  return stored.config ?? DEFAULT_CONFIG;
}

function getEffectiveDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function getGroupKey(url, splitByPath, ignoreDomains) {
  try {
    const { hostname, pathname } = new URL(url);
    const domain = getEffectiveDomain(hostname);
    if (ignoreDomains.some(d => domain === d || domain.endsWith('.' + d))) return null;
    if (splitByPath.some(d => domain === d || domain.endsWith('.' + d))) {
      const firstSegment = pathname.split('/').filter(Boolean)[0];
      if (firstSegment) return `${domain}/${firstSegment}`;
    }
    return domain;
  } catch {
    return null;
  }
}

async function saveStash(tabs) {
  await api.storage.local.set({
    stash: {
      tabs: tabs.map(t => ({ tabId: t.id, windowId: t.windowId, index: t.index })),
      timestamp: Date.now(),
    },
  });
}

async function splitTabs(all = false) {
  const config = await loadConfig();
  const tabs = await api.tabs.query(all ? {} : { currentWindow: true });

  const { stash: existingStash } = await api.storage.local.get('stash');
  if (!existingStash) await saveStash(tabs);

  const splitByPath = config.splitByPath ?? [];
  const ignoreDomains = config.ignoreDomains ?? [];
  const minTabs = config.minTabs ?? 2;

  // Pinned tabs and non-http tabs stay put
  const validTabs = tabs.filter(t => t.url && /^https?:\/\//.test(t.url) && !t.pinned);

  const groups = new Map(); // group key → tab[]
  for (const tab of validTabs) {
    const key = getGroupKey(tab.url, splitByPath, ignoreDomains);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }

  let windowsCreated = 0;
  for (const [, groupTabs] of groups) {
    if (groupTabs.length < minTabs) continue;
    // Most recently accessed tab first
    groupTabs.sort((a, b) => (b.lastAccessed ?? b.id) - (a.lastAccessed ?? a.id));
    const [firstId, ...restIds] = groupTabs.map(t => t.id);
    const newWin = await api.windows.create({ tabId: firstId });
    if (restIds.length > 0) {
      await api.tabs.move(restIds, { windowId: newWin.id, index: -1 });
    }
    windowsCreated++;
  }

  const summary = { tabsGrouped: validTabs.length, windowsCreated, timestamp: Date.now() };
  await api.storage.local.set({ lastRun: summary });
  await updateBadge();
  return summary;
}

async function detachActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { error: 'no active tab' };

  const { detachLog = {} } = await api.storage.local.get('detachLog');
  const origin = detachLog[tab.id];

  // Toggle path: tab is in the detach log → merge it back to its origin.
  // Firefox preserves tab.id across tabs.move, so the log key stays valid.
  if (origin) {
    const openWindows = new Set((await api.windows.getAll()).map(w => w.id));
    if (!openWindows.has(origin.windowId)) {
      delete detachLog[tab.id];
      await api.storage.local.set({ detachLog });
      return { error: 'original window has been closed' };
    }
    await api.tabs.move(tab.id, { windowId: origin.windowId, index: origin.index });
    await api.tabs.update(tab.id, { active: true });
    await api.windows.update(origin.windowId, { focused: true });
    delete detachLog[tab.id];
    await api.storage.local.set({ detachLog });
    await updateBadge();
    return { merged: tab.id, title: tab.title };
  }

  const tabsInWin = await api.tabs.query({ windowId: tab.windowId });
  // Firefox refuses to create a window from a tab that is its window's only
  // tab; treat that as a no-op rather than an error.
  if (tabsInWin.length <= 1) return { skipped: true, reason: 'only tab in window' };

  detachLog[tab.id] = {
    windowId: tab.windowId,
    index: tab.index,
    timestamp: Date.now(),
  };
  await api.storage.local.set({ detachLog });
  await api.windows.create({ tabId: tab.id });
  await updateBadge();
  return { detached: tab.id, title: tab.title };
}

// Drop detach-log entries for tabs that no longer exist so the map doesn't
// grow unboundedly across browser sessions.
api.tabs.onRemoved.addListener(async (tabId) => {
  const { detachLog } = await api.storage.local.get('detachLog');
  if (detachLog && detachLog[tabId]) {
    delete detachLog[tabId];
    await api.storage.local.set({ detachLog });
  }
});

async function revertTabs() {
  const { stash } = await api.storage.local.get('stash');
  if (!stash) throw new Error('Nothing to revert');

  const existingTabIds = new Set((await api.tabs.query({})).map(t => t.id));
  const openWindows = new Set((await api.windows.getAll()).map(w => w.id));

  const windowGroups = new Map();
  for (const entry of stash.tabs.sort((a, b) => a.index - b.index)) {
    if (!existingTabIds.has(entry.tabId)) continue;
    if (!windowGroups.has(entry.windowId)) windowGroups.set(entry.windowId, []);
    windowGroups.get(entry.windowId).push(entry.tabId);
  }

  let tabsRestored = 0;
  for (const [origWindowId, tabIds] of windowGroups) {
    if (openWindows.has(origWindowId)) {
      await api.tabs.move(tabIds, { windowId: origWindowId, index: -1 });
    } else {
      const [firstId, ...restIds] = tabIds;
      const newWin = await api.windows.create({ tabId: firstId });
      if (restIds.length > 0) {
        await api.tabs.move(restIds, { windowId: newWin.id, index: -1 });
      }
    }
    tabsRestored += tabIds.length;
  }

  await api.storage.local.remove('stash');
  await updateBadge();
  return { tabsRestored };
}

function countSplittable(tabs, splitByPath, ignoreDomains, minTabs) {
  const counts = new Map();
  for (const tab of tabs) {
    if (!tab.url || !/^https?:\/\//.test(tab.url) || tab.pinned) continue;
    const key = getGroupKey(tab.url, splitByPath, ignoreDomains);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter(c => c >= minTabs).length;
}

async function updateBadge() {
  try {
    const config = await loadConfig();
    const splitByPath = config.splitByPath ?? [];
    const ignoreDomains = config.ignoreDomains ?? [];
    const minTabs = config.minTabs ?? 2;
    const allTabs = await api.tabs.query({});

    const tabsByWindow = new Map();
    for (const tab of allTabs) {
      if (!tabsByWindow.has(tab.windowId)) tabsByWindow.set(tab.windowId, []);
      tabsByWindow.get(tab.windowId).push(tab);
    }

    for (const [windowId, tabs] of tabsByWindow) {
      const splittable = countSplittable(tabs, splitByPath, ignoreDomains, minTabs);
      const text = splittable > 0 ? String(splittable) : '';
      try {
        await api.action.setBadgeText({ windowId, text });
        await api.action.setBadgeBackgroundColor({ windowId, color: '#5f6368' });
        await api.action.setBadgeTextColor({ windowId, color: '#ffffff' });
      } catch {
        // fall back to global badge if windowId not supported
        api.action.setBadgeText({ text });
        api.action.setBadgeBackgroundColor({ color: '#5f6368' });
        api.action.setBadgeTextColor({ color: '#ffffff' });
      }
    }
  } catch {
    // best-effort
  }
}

// Debounced badge refresh on tab changes
let badgeTimer = null;
function scheduleBadgeUpdate() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(updateBadge, 600);
}
api.tabs.onCreated.addListener(scheduleBadgeUpdate);
api.tabs.onRemoved.addListener(scheduleBadgeUpdate);
api.tabs.onUpdated.addListener((_id, changeInfo) => { if (changeInfo.url) scheduleBadgeUpdate(); });

api.commands.onCommand.addListener(async (command) => {
  if (command === 'split') await splitTabs(false);
  if (command === 'split-all') await splitTabs(true);
  if (command === 'revert') await revertTabs();
  if (command === 'detach') await detachActiveTab();
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'split') {
    splitTabs(message.all ?? false).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.action === 'revert') {
    revertTabs().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.action === 'detach') {
    detachActiveTab().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.action === 'getStash') {
    api.storage.local.get('stash').then(r => sendResponse(r.stash ?? null));
    return true;
  }
});
