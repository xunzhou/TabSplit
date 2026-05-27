#!/usr/bin/env node
// Fetch the latest signed .xpi from AMO into web-ext-artifacts/.
// Used after `web-ext sign` exits before approval, or after a manual upload.
//
// Reads WEB_EXT_API_KEY / WEB_EXT_API_SECRET from process.env first, then
// falls back to parsing .env (both `KEY=VAL` and fish `set -x KEY VAL` forms).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const out = { ...process.env };
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    let m = line.match(/^\s*set\s+(?:-x\s+)?(\S+)\s+(.+?)\s*$/);
    if (!m) m = line.match(/^\s*(?:export\s+)?(\S+?)=(.+?)\s*$/);
    if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv();
const KEY = env.WEB_EXT_API_KEY;
const SEC = env.WEB_EXT_API_SECRET;
if (!KEY || !SEC) {
  console.error('Missing WEB_EXT_API_KEY / WEB_EXT_API_SECRET (env or .env)');
  process.exit(1);
}

const GUID = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'))
  .browser_specific_settings.gecko.id;

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const jwt = () => {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ iss: KEY, jti: Math.random().toString(36).slice(2), iat: now, exp: now + 60 });
  const s = createHmac('sha256', SEC).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
};

async function amo(path) {
  const r = await fetch(`https://addons.mozilla.org${path}`, {
    headers: { Authorization: `JWT ${jwt()}` },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`AMO ${path} -> ${r.status} ${t}`);
  return JSON.parse(t);
}

const target = process.argv[2];  // optional: specific version like 1.0.1
const list = await amo(`/api/v5/addons/addon/${encodeURIComponent(GUID)}/versions/?filter=all_with_unlisted`);
const v = target
  ? list.results.find(x => x.version === target)
  : list.results[0];
if (!v) throw new Error(target ? `version ${target} not found` : 'no versions');
if (v.file.status !== 'public') {
  console.error(`Warning: file status is "${v.file.status}" (not "public") — may still be in review`);
}
console.log(`Version ${v.version}  file=${v.file.id}  status=${v.file.status}`);

const xpi = await fetch(v.file.url, { headers: { Authorization: `JWT ${jwt()}` }, redirect: 'follow' });
if (!xpi.ok) throw new Error(`download ${xpi.status} ${await xpi.text()}`);

const outDir = resolve(ROOT, 'web-ext-artifacts');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, `tabsplit-${v.version}.xpi`);
writeFileSync(out, Buffer.from(await xpi.arrayBuffer()));
console.log(`Saved: ${out}`);
