# Custom New Tab Dashboard

An editable New Tab page for Edge, Chrome, Brave and other Chromium browsers, with shortcut tiles and a yellow scratchpad. The cursor stays in the address bar when you open a new tab, so you can start typing right away.

- Add, edit, drag and resize shortcuts right on the page. No code.
- Sharp icons found automatically, with a **Try another icon** button, or upload your own.
- Notes that save as you type and turn pasted links into clickable ones.
- Light, dark or system theme, and adjustable layout.
- Your shortcuts and notes stay in your own browser. Optional backup to a private GitHub repository that you control.
- Updates itself: when a new version is published here, a button appears on your New Tab page.

## 1. Install (one time per browser)

1. Download **[custom-new-tab-wrapper.zip](https://github.com/MrKiwiSir/Custom-New-Browser-Tab/raw/main/custom-new-tab-wrapper.zip)**.
2. Unzip it somewhere you won't delete it, like your `Documents` folder.
3. Open your browser's extensions page: `edge://extensions` in Edge, `chrome://extensions` in Chrome, `brave://extensions` in Brave.
4. Turn on **Developer mode**.
5. Click **Load unpacked** and pick the unzipped `custom-new-tab-wrapper` folder (the one that contains `manifest.json`).
6. Open a new tab (`Ctrl + T`). If the browser asks whether to keep the change, click **Keep changes**.

That folder is a small wrapper. It shows the dashboard from this repository's website, which is how updates reach you without reinstalling anything.

**Coming from an older copy of this dashboard?** Before step 3, open a new tab, click **Settings**, then **Download Backup** (older copies call it **Export JSON**). Remove the old extension, install the wrapper, then click **Settings**, **Restore Backup**.

## 2. Make it yours

Click **Edit** at the bottom right to add, change, move or delete shortcuts and widgets. Click **Settings** for layout, theme and backups.

## 3. Getting updates

- When a new version is available, a blue **Update to ...** button appears at the bottom right of your New Tab page. Click it.
- To look for one yourself: **Settings**, then **Check for Updates**.
- Updating replaces only the program. Your shortcuts, notes and settings stay as they are.
- The dashboard keeps a copy of itself in the browser, so new tabs open instantly and still work without internet.

The page looks for a new version at most once every 15 minutes. **Check for Updates** always looks immediately.

## 4. Back up your shortcuts to GitHub (optional)

Your backup goes to a **private** repository of your own. The dashboard refuses to back up to a public one.

1. On GitHub, create a new repository, choose **Private**, and tick **Add a README file**.
2. Go to **Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token**:
   - Under **Repository access**, pick **Only select repositories** and choose your private repository.
   - Under **Repository permissions**, set **Contents** to **Read and write**.
   - Click **Generate token** and copy it.
3. On your New Tab page, click **Settings**, find **GitHub Backup & Sync**, paste your **GitHub Token** and the link to your private repository, then click **Save to GitHub Now**.

The backup is saved in a folder named `new-tab-dashboard`. Each browser saves to its own file there, so Edge and Chrome won't overwrite each other. To make two browsers share the same links, switch **Browser Sync Style** to **Share the same links across all browsers** in both.

Your token is stored only in your browser. It is never uploaded.

## Privacy

- Shortcuts and notes are stored in your browser, and in your own private repository if you turn on backup. They are never sent to this project.
- To find icons, the dashboard asks Google's and DuckDuckGo's icon services, and the site itself, for each shortcut's icon. Those services can see which sites you have shortcuts for.

## License

Free to use, copy and adapt for any noncommercial purpose under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Commercial use needs permission from the owner.

Required Notice: Copyright 2026 MrKiwiSir (https://github.com/MrKiwiSir)

## For whoever maintains the code

See [AGENTS.md](AGENTS.md).
