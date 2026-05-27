# TabSplit

A browser extension for Chrome and Firefox that splits tabs from the same site into separate windows on demand. Each site with 2+ open tabs becomes its own window, sorted by most recently visited; single tabs stay put.

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

## License

MIT
