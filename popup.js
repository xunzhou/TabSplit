const api = typeof browser !== 'undefined' ? browser : chrome;

const splitBtn = document.getElementById('split');
const splitAllBtn = document.getElementById('split-all');
const revertBtn = document.getElementById('revert');
const detachBtn = document.getElementById('detach');
const status = document.getElementById('status');

const allBtns = [splitBtn, splitAllBtn, revertBtn, detachBtn];

function setWorking(msg) {
  allBtns.forEach(b => { b.disabled = true; });
  status.textContent = msg;
  status.className = '';
}

function setDone(msg) {
  allBtns.forEach(b => { b.disabled = false; });
  status.textContent = msg;
}

function setError(msg) {
  allBtns.forEach(b => { b.disabled = false; });
  status.textContent = msg;
  status.className = 'error';
}

async function refreshStashState() {
  const stash = await api.runtime.sendMessage({ action: 'getStash' });
  revertBtn.disabled = !stash;
  if (stash) {
    const ago = Math.round((Date.now() - stash.timestamp) / 1000);
    const agoStr = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
    status.textContent = `Stash from ${agoStr} (${stash.tabs.length} tabs)`;
  }
}

async function doReorganize(all) {
  setWorking(all ? 'Splitting all windows…' : 'Splitting…');
  try {
    const result = await api.runtime.sendMessage({ action: 'split', all });
    if (result?.error) throw new Error(result.error);
    setDone(`Done: ${result.windowsCreated} windows, ${result.tabsGrouped} tabs moved`);
    revertBtn.disabled = false;
  } catch (err) {
    setError(err.message);
  }
}

splitBtn.addEventListener('click', () => doReorganize(false));
splitAllBtn.addEventListener('click', () => doReorganize(true));

detachBtn.addEventListener('click', async () => {
  setWorking('…');
  try {
    const result = await api.runtime.sendMessage({ action: 'detach' });
    if (result?.error) throw new Error(result.error);
    if (result?.skipped) {
      setDone('Skipped: only tab in window');
      return;
    }
    if (result?.merged) {
      setDone('Merged back to original window');
      return;
    }
    setDone('Detached to new window');
  } catch (err) {
    setError(err.message);
  }
});

revertBtn.addEventListener('click', async () => {
  setWorking('Reverting…');
  try {
    const result = await api.runtime.sendMessage({ action: 'revert' });
    if (result?.error) throw new Error(result.error);
    setDone(`Reverted: ${result.tabsRestored} tabs restored`);
    revertBtn.disabled = true;
  } catch (err) {
    setError(err.message);
  }
});

document.getElementById('options-link').addEventListener('click', () => {
  api.runtime.openOptionsPage();
});

refreshStashState();
