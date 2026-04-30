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

function render(config) {
  document.getElementById('min-tabs').value = config.minTabs ?? 2;
  document.getElementById('split-by-path').value = (config.splitByPath ?? []).join('\n');
  document.getElementById('ignore-domains').value = (config.ignoreDomains ?? []).join('\n');
}

function parseLines(id) {
  return document.getElementById(id).value.split('\n').map(d => d.trim()).filter(Boolean);
}

document.getElementById('save').addEventListener('click', async () => {
  const config = {
    minTabs: Math.max(1, parseInt(document.getElementById('min-tabs').value, 10) || 2),
    splitByPath: parseLines('split-by-path'),
    ignoreDomains: parseLines('ignore-domains'),
  };
  await api.storage.sync.set({ config });
  const msg = document.getElementById('saved-msg');
  msg.style.display = 'inline';
  setTimeout(() => { msg.style.display = 'none'; }, 2000);
});

document.getElementById('reset').addEventListener('click', async () => {
  await api.storage.sync.remove('config');
  render(DEFAULT_CONFIG);
});

loadConfig().then(render);
