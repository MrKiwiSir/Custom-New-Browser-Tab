# Notes for AI assistants and developers

The owner of this project does not code. Do all repository work yourself and give instructions in plain English with exact button names. Never ask them to edit files.

## How it fits together

- The dashboard (`index.html`, `style.css`, `app.js`) is plain HTML, CSS and JavaScript with no build step. GitHub Pages serves it from the `main` branch root at `https://mrkiwisir.github.io/Custom-New-Browser-Tab/`.
- `extension/` is a tiny Manifest V3 wrapper the owner installed once. Its New Tab page is a full-screen frame showing the Pages URL. Extensions cannot run remote code directly, which is why the dashboard is framed.
- `sw.js` caches the dashboard's files the first time they load and serves them from that cache afterwards. There is no file list to maintain.
- `version.json` is the only version number that matters. The cached copy is the "installed" version, the live copy is the "latest". When they differ the page shows an **Update to ...** button, which empties the cache and reloads.

## Shipping a change

1. Edit the files.
2. **Raise `version` in `version.json`** and write one plain-English sentence in `notes` (the owner sees it). Without this, nobody is offered the update.
3. Push to `main`. Pages redeploys in a minute or two.

Keep `manifest.json` in the root in step with `version.json`. It only matters to someone loading the root folder directly as an unpacked extension, which gets no updates.

`custom-new-tab-wrapper.zip` in the root is the download the README links to. It is a zip of `extension/` with the top folder named `custom-new-tab-wrapper`; rebuild it if `extension/` ever changes.

Avoid changing `extension/`. The owner would have to reinstall it by hand. Its `key` field pins the extension's ID, which the browser uses to separate stored data, so removing or changing it makes the owner's shortcuts appear to vanish.

## Rules that must not break

- **Address bar focus.** A new tab must leave the cursor in the address bar. No `autofocus`, and no `.focus()` that runs on load, in the dashboard or the wrapper.
- **Runs inside a cross-origin frame.** `alert`, `confirm` and `prompt` silently do nothing there; use in-page UI (see `confirmByClick` in `app.js`). Links need to replace the whole tab, which `<base target="_top">` in `index.html` handles.
- **No personal data in this repository.** It is public and other people install from it. That includes the starter layout in `createDefaultState`, which must stay generic. Shortcuts and notes live in the browser's storage and optionally in the owner's separate private backup repository. `app.js` refuses to back up to a public repository; keep that check.
- **Storage keys.** `custom_newtab_state_v1` and `custom_newtab_github_repo_sync_v3` in `localStorage` hold the owner's data and sync settings. Renaming them loses data unless you migrate.
- **`sw.js` ignores requests that have a query string.** That is how the update check reaches the network. Do not load the app's own files with query strings.
