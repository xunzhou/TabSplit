# TabSplit

A browser extension for Chrome and Firefox that splits tabs from the same site into separate windows on demand.

## How it works

Press **Alt+Shift+R** to split the current window. Any site with 2 or more open tabs gets its own browser window, sorted by most recently visited. Single tabs stay put. Press **Alt+Shift+Z** to undo.

## Installation

### Chrome
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `TabSplit` folder
4. Set keyboard shortcuts at `chrome://extensions/shortcuts`

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** → select `manifest.json`

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+R` | Split tabs in current window |
| `Alt+Shift+W` | Split tabs across all windows |
| `Alt+Shift+D` | Detach current tab to a new window (press again on the same tab to merge it back) |
| `Alt+Shift+Z` | Revert to previous layout |

## Settings

Open the extension settings to configure:

- **Threshold** — minimum tabs per site before splitting (default: 2)
- **Split by path** — domains where the first URL path segment is also used for grouping (e.g. `atlassian.net` splits `/jira` and `/wiki` into separate windows)
- **Ignore** — domains that are never split regardless of tab count

## Persistent install (signed, self-distributed)

1. Get AMO API credentials at https://addons.mozilla.org/en-US/developers/addon/api/key/
2. Export them (e.g. in `~/.config/fish/config.fish` or a sourced `.env`):
   ```fish
   set -x WEB_EXT_API_KEY user:XXXXXXXX:YYY
   set -x WEB_EXT_API_SECRET ZZZZZZZZ...
   ```
3. Bump `version` in `manifest.json` (AMO rejects duplicate versions).
4. Build + sign:
   ```bash
   npm install      # first time only
   npm run sign     # produces a signed XPI in web-ext-artifacts/
   ```
5. Install permanently: `about:addons` → ⚙ → **Install Add-on From File…** → pick the XPI.

`npm run lint` runs `web-ext lint` against the manifest; `npm run build` produces an unsigned XPI without contacting AMO.

## License

MIT
