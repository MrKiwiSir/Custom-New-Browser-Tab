(() => {
  "use strict";

  const STORAGE_KEY = "custom_newtab_state_v1";
  const SYNC_CONFIG_KEY = "custom_newtab_github_repo_sync_v3";
  const GH_API_VERSION = "2022-11-28";
  // Folder inside the owner's private backup repository. Named after this
  // program so it is easy to tell apart from other programs' data there.
  const BACKUP_FOLDER = "new-tab-dashboard";

  let isEditMode = false;
  let dragState = null;
  let autoPushTimer = null;
  let pendingUploadedDataUrl = "";
  let isPushing = false;

  // Browser pop-up confirm boxes do not work when the dashboard is shown inside
  // the New Tab wrapper, so destructive buttons ask for a second click instead.
  function confirmByClick(btn, action) {
    if (btn.dataset.armed === "1") {
      clearTimeout(Number(btn.dataset.armTimer));
      btn.dataset.armed = "";
      btn.textContent = btn.dataset.label;
      action();
      return;
    }
    btn.dataset.label = btn.textContent;
    btn.dataset.armed = "1";
    btn.textContent = "Click again to confirm";
    btn.dataset.armTimer = String(setTimeout(() => {
      btn.dataset.armed = "";
      btn.textContent = btn.dataset.label;
    }, 4000));
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function detectBrowserName() {
    const ua = navigator.userAgent || "";
    if (navigator.brave) return "Brave";
    if (ua.includes("Edg/") || ua.includes("EdgA/") || ua.includes("EdgiOS/")) return "Edge";
    if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
    if (ua.includes("Vivaldi")) return "Vivaldi";
    if (ua.includes("Firefox/")) return "Firefox";
    if (ua.includes("Chrome/")) return "Chrome";
    if (ua.includes("Safari/")) return "Safari";
    return "Browser";
  }

  function slugifyName(name) {
    const slug = (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || detectBrowserName().toLowerCase();
  }

  function getAutomaticRepoPath(cfg) {
    if (cfg.syncMode === "shared") {
      return `${BACKUP_FOLDER}/shared.json`;
    }
    const name = slugifyName(cfg.profileName || detectBrowserName());
    return `${BACKUP_FOLDER}/${name}.json`;
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    const clean = (b64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function parseRepoInput(raw) {
    let cleaned = (raw || "").trim();
    cleaned = cleaned.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
    cleaned = cleaned.replace(/\.git$/i, "");
    cleaned = cleaned.replace(/^\/+|\/+$/g, "");
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1], normalized: `${parts[0]}/${parts[1]}` };
  }

  function encodeRepoPath(pathStr) {
    return pathStr
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
  }

  function createDefaultState() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      settings: {
        pageCols: 2,
        maxWidth: 1280,
        iconSize: 88,
        iconRadius: 18,
        gridGap: 18,
        showLabels: true,
        openInNewTab: false,
        theme: "light"
      },
      // A neutral starter set for anyone installing this. Keep it generic:
      // this file is public, so nobody's personal shortcuts belong here.
      widgets: [
        {
          id: "w_left",
          type: "shortcuts",
          title: "Everyday",
          pageSpan: 1,
          columns: 5,
          iconSize: 0,
          items: [
            { id: "s1", title: "Google", url: "https://www.google.com", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 },
            { id: "s2", title: "Gmail", url: "https://mail.google.com", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 },
            { id: "s3", title: "YouTube", url: "https://www.youtube.com", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 },
            { id: "s4", title: "Google Maps", url: "https://maps.google.com", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 },
            { id: "s5", title: "Google Calendar", url: "https://calendar.google.com", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 }
          ]
        },
        {
          id: "w_right",
          type: "shortcuts",
          title: "Learn",
          pageSpan: 1,
          columns: 5,
          iconSize: 0,
          items: [
            { id: "s6", title: "Wikipedia", url: "https://www.wikipedia.org", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 },
            { id: "s7", title: "Khan Academy", url: "https://www.khanacademy.org", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 },
            { id: "s8", title: "Internet Archive", url: "https://archive.org", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 },
            { id: "s9", title: "GitHub", url: "https://github.com", iconType: "auto", iconValue: "", bgColor: "#ffffff", textColor: "#1f2937", iconFit: "contain", colSpan: 1, rowSpan: 1 }
          ]
        },
        {
          id: "w_note",
          type: "note",
          title: "note",
          pageSpan: 1,
          noteColor: "#fce878",
          noteHeight: 140,
          content: "Welcome! Click Edit (bottom right) to add, move or remove shortcuts.\n\nClick anywhere in this box to write notes. Pasted links become clickable when you click outside."
        }
      ]
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.widgets)) return createDefaultState();
      parsed.settings = Object.assign(createDefaultState().settings, parsed.settings || {});
      return parsed;
    } catch {
      return createDefaultState();
    }
  }

  function loadSyncConfig() {
    const defaults = {
      token: "",
      repo: "",
      branch: "",
      syncMode: "separate",
      profileName: detectBrowserName(),
      autoPush: false,
      autoPull: false
    };
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_KEY);
      if (raw) return Object.assign(defaults, JSON.parse(raw));
      // Migrate token/repo if user previously configured v2
      const oldRaw = localStorage.getItem("custom_newtab_github_repo_sync_v2");
      if (oldRaw) {
        const old = JSON.parse(oldRaw);
        return Object.assign(defaults, {
          token: old.token || "",
          repo: old.repo || "",
          branch: old.branch || "",
          autoPush: !!old.autoPush,
          autoPull: !!old.autoPull
        });
      }
      return defaults;
    } catch {
      return defaults;
    }
  }

  function saveSyncConfig(cfg) {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg));
  }

  let state = loadState();
  let syncConfig = loadSyncConfig();

  function saveState(triggerAutoPush = true) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (triggerAutoPush && syncConfig.autoPush && syncConfig.token && syncConfig.repo) {
      scheduleAutoPush();
    }
  }

  function scheduleAutoPush() {
    clearTimeout(autoPushTimer);
    setBadge("Saving to GitHub...");
    autoPushTimer = setTimeout(() => {
      pushToGitHub(true);
    }, 2500);
  }

  function setBadge(text, hideAfterMs = 0) {
    const badge = document.getElementById("syncBadge");
    if (!text) {
      badge.classList.remove("visible");
      badge.textContent = "";
      return;
    }
    badge.textContent = text;
    badge.classList.add("visible");
    if (hideAfterMs > 0) {
      setTimeout(() => {
        if (badge.textContent === text) {
          badge.classList.remove("visible");
        }
      }, hideAfterMs);
    }
  }

  function applyThemeAndVars() {
    const s = state.settings;
    const root = document.documentElement;
    root.style.setProperty("--page-cols", String(s.pageCols || 2));
    root.style.setProperty("--max-width", `${s.maxWidth || 1280}px`);
    root.style.setProperty("--icon-size", `${s.iconSize || 88}px`);
    root.style.setProperty("--icon-radius", `${s.iconRadius ?? 18}px`);
    root.style.setProperty("--grid-gap", `${s.gridGap || 18}px`);

    document.body.classList.toggle("hide-labels", !s.showLabels);

    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useDark = s.theme === "dark" || (s.theme === "system" && prefersDark);
    document.body.classList.toggle("theme-dark", useDark);
    notifyWrapper();
  }

  function notifyWrapper() {
    if (window.parent === window) return;
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      window.parent.postMessage({ type: "cnt-ready", bg }, "*");
    } catch {
      // Not embedded, nothing to do.
    }
  }

  function normalizeUrl(raw) {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "https://example.com";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  // ---------------------------------------------------------------------
  // Automatic icons. Several places are asked for a site's icon and the
  // first one that is at least MIN_SHARP_ICON pixels wide wins, so a tiny
  // 16px favicon is never stretched across a whole tile. The choice is
  // remembered on the shortcut (autoIcon / autoIconSize / autoIconFor).
  // ---------------------------------------------------------------------
  const MIN_SHARP_ICON = 64;
  const MIN_USABLE_ICON = 32;
  const iconSearches = new Map();

  function getHost(urlStr) {
    try {
      return new URL(normalizeUrl(urlStr)).hostname;
    } catch {
      return "";
    }
  }

  function iconCandidates(urlStr) {
    let u;
    try {
      u = new URL(normalizeUrl(urlStr));
    } catch {
      return [];
    }
    if (!/^https?:$/.test(u.protocol)) return [];
    const host = encodeURIComponent(u.hostname);
    return [
      `https://www.google.com/s2/favicons?domain=${host}&sz=256`,
      `${u.origin}/apple-touch-icon.png`,
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `${u.origin}/apple-touch-icon-precomposed.png`,
      `${u.origin}/favicon.ico`
    ];
  }

  function probeIcon(url) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), 6000);
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        clearTimeout(timer);
        resolve({ url, size: Math.min(img.naturalWidth, img.naturalHeight) });
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });
  }

  // Every icon that could be found for a site, sharpest first.
  function findAllIcons(urlStr) {
    return Promise.all(iconCandidates(urlStr).map(probeIcon)).then((found) =>
      found.filter(Boolean).sort((a, b) => b.size - a.size)
    );
  }

  // The icon to use when the user has not chosen one: stops at the first
  // sharp one. Returns null if nothing could be reached (probably offline).
  function findBestIcon(urlStr) {
    const host = getHost(urlStr);
    if (!host) return Promise.resolve(null);
    if (iconSearches.has(host)) return iconSearches.get(host);
    const search = (async () => {
      let best = null;
      for (const candidate of iconCandidates(urlStr)) {
        const hit = await probeIcon(candidate);
        if (!hit) continue;
        if (hit.size >= MIN_SHARP_ICON) return hit;
        if (!best || hit.size > best.size) best = hit;
      }
      return best;
    })();
    iconSearches.set(host, search);
    search.then((hit) => {
      if (!hit) iconSearches.delete(host);
    });
    return search;
  }

  // Never blow a small picture up to more than twice its real size.
  function keepIconSharp(img) {
    const real = Math.min(img.naturalWidth, img.naturalHeight);
    if (!real || real >= MIN_SHARP_ICON) {
      img.classList.remove("icon-native");
      img.style.width = "";
      img.style.height = "";
      return;
    }
    img.classList.add("icon-native");
    img.style.width = `${real * 2}px`;
    img.style.height = "auto";
  }

  function linkifyText(container, text) {
    container.textContent = "";
    if (!text || !text.trim()) {
      container.classList.add("is-empty");
      container.textContent = "Click to write a note...";
      return;
    }
    container.classList.remove("is-empty");
    const urlRegex = /(https?:\/\/[^\s]+|data:[^\s]+)/g;
    let lastIndex = 0;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const a = document.createElement("a");
      a.href = match[0];
      a.textContent = match[0];
      if (state.settings.openInNewTab) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      container.appendChild(a);
      lastIndex = urlRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderDashboard() {
    applyThemeAndVars();
    const dashboard = document.getElementById("dashboard");
    dashboard.textContent = "";

    state.widgets.forEach((widget, widgetIndex) => {
      const section = document.createElement("section");
      section.className = "widget";
      section.dataset.widgetId = widget.id;

      const span = Math.min(widget.pageSpan || 1, state.settings.pageCols || 2);
      if (widget.pageSpan >= 4) {
        section.style.gridColumn = "1 / -1";
      } else if (span > 1) {
        section.style.gridColumn = `span ${span}`;
      }

      if (widget.type === "note") {
        section.classList.add("note-card");
        section.style.backgroundColor = widget.noteColor || "#fce878";
      }

      const header = document.createElement("div");
      header.className = "widget-header";

      const title = document.createElement("h2");
      title.className = "widget-title";
      title.textContent = widget.title || (widget.type === "note" ? "note" : "Shortcuts");
      header.appendChild(title);

      const controls = document.createElement("div");
      controls.className = "widget-controls";

      if (widgetIndex > 0) {
        const upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.className = "mini-btn";
        upBtn.textContent = "←";
        upBtn.title = "Move widget earlier";
        upBtn.addEventListener("click", () => moveWidget(widgetIndex, -1));
        controls.appendChild(upBtn);
      }

      if (widgetIndex < state.widgets.length - 1) {
        const downBtn = document.createElement("button");
        downBtn.type = "button";
        downBtn.className = "mini-btn";
        downBtn.textContent = "→";
        downBtn.title = "Move widget later";
        downBtn.addEventListener("click", () => moveWidget(widgetIndex, 1));
        controls.appendChild(downBtn);
      }

      const gearBtn = document.createElement("button");
      gearBtn.type = "button";
      gearBtn.className = "mini-btn";
      gearBtn.textContent = "Layout / Edit";
      gearBtn.addEventListener("click", () => openWidgetModal(widget.id));
      controls.appendChild(gearBtn);

      header.appendChild(controls);
      section.appendChild(header);

      if (widget.type === "shortcuts") {
        const grid = document.createElement("div");
        grid.className = "shortcut-grid";
        grid.style.setProperty("--widget-cols", String(widget.columns || 5));
        if (widget.iconSize && widget.iconSize > 0) {
          grid.style.setProperty("--tile-size", `${widget.iconSize}px`);
        }

        grid.addEventListener("dragover", (e) => {
          if (!isEditMode || !dragState) return;
          e.preventDefault();
        });
        grid.addEventListener("drop", (e) => {
          if (!isEditMode || !dragState) return;
          if (e.target === grid) {
            e.preventDefault();
            moveShortcutItem(dragState.widgetId, dragState.itemId, widget.id, null);
          }
        });

        (widget.items || []).forEach((item) => {
          grid.appendChild(createShortcutTile(widget, item));
        });

        if (isEditMode) {
          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "add-tile-btn";
          addBtn.innerHTML = `<div class="add-tile-box">+</div><span class="tile-label">Add site</span>`;
          addBtn.addEventListener("click", () => openShortcutModal(widget.id, null));
          grid.appendChild(addBtn);
        }

        section.appendChild(grid);
      } else if (widget.type === "note") {
        const display = document.createElement("div");
        display.className = "note-display";
        display.style.minHeight = `${widget.noteHeight || 140}px`;
        linkifyText(display, widget.content || "");

        const textarea = document.createElement("textarea");
        textarea.className = "note-textarea hidden";
        textarea.style.minHeight = `${widget.noteHeight || 140}px`;
        textarea.value = widget.content || "";
        textarea.placeholder = "Type notes or paste links here...";

        display.addEventListener("click", () => {
          display.classList.add("hidden");
          textarea.classList.remove("hidden");
          textarea.value = widget.content || "";
          textarea.focus();
        });

        textarea.addEventListener("input", () => {
          widget.content = textarea.value;
          saveState(true);
        });

        textarea.addEventListener("blur", () => {
          widget.content = textarea.value;
          saveState(true);
          linkifyText(display, widget.content);
          textarea.classList.add("hidden");
          display.classList.remove("hidden");
        });

        section.appendChild(display);
        section.appendChild(textarea);
      }

      dashboard.appendChild(section);
    });
  }

  function createShortcutTile(widget, item) {
    const a = document.createElement("a");
    a.className = "shortcut-tile";
    a.href = normalizeUrl(item.url);
    a.title = `${item.title}\n${item.url}`;
    if (state.settings.openInNewTab) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }

    const colSpan = Math.min(item.colSpan || 1, widget.columns || 5);
    const rowSpan = item.rowSpan || 1;
    a.dataset.colSpan = String(colSpan);
    a.dataset.rowSpan = String(rowSpan);
    if (colSpan > 1) a.style.gridColumn = `span ${colSpan}`;
    if (rowSpan > 1) a.style.gridRow = `span ${rowSpan}`;

    if (isEditMode) {
      a.draggable = true;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openShortcutModal(widget.id, item.id);
      });
    }

    a.addEventListener("dragstart", (e) => {
      if (!isEditMode) return;
      dragState = { widgetId: widget.id, itemId: item.id };
      a.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
    });

    a.addEventListener("dragend", () => {
      a.classList.remove("dragging");
      dragState = null;
      document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    });

    a.addEventListener("dragover", (e) => {
      if (!isEditMode || !dragState || dragState.itemId === item.id) return;
      e.preventDefault();
      a.classList.add("drag-over");
    });

    a.addEventListener("dragleave", () => {
      a.classList.remove("drag-over");
    });

    a.addEventListener("drop", (e) => {
      if (!isEditMode || !dragState) return;
      e.preventDefault();
      e.stopPropagation();
      a.classList.remove("drag-over");
      moveShortcutItem(dragState.widgetId, dragState.itemId, widget.id, item.id);
    });

    const box = document.createElement("div");
    box.className = "tile-icon-box";
    box.style.backgroundColor = item.bgColor || "#f3f4f6";

    const renderMonogram = () => {
      box.textContent = "";
      const span = document.createElement("span");
      span.className = "tile-monogram";
      span.style.color = item.textColor || "#1f2937";
      const label = (item.iconType === "monogram" && item.iconValue)
        ? item.iconValue
        : (item.title || "?").trim().slice(0, 2).toUpperCase();
      span.textContent = label;
      box.appendChild(span);
    };

    if (item.iconType === "monogram") {
      renderMonogram();
    } else {
      const img = document.createElement("img");
      img.alt = item.title || "";
      img.className = item.iconFit === "cover" ? "fit-cover" : (item.iconFit === "padded" ? "fit-padded" : "fit-contain");
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", renderMonogram);
      img.addEventListener("load", () => keepIconSharp(img));

      if ((item.iconType === "url" || item.iconType === "upload") && item.iconValue) {
        img.src = item.iconValue;
        box.appendChild(img);
      } else {
        const host = getHost(item.url);
        const known = item.autoIconFor === host && typeof item.autoIcon === "string";
        if (known && item.autoIcon) {
          img.src = item.autoIcon;
          box.appendChild(img);
        } else if (known) {
          // Looked before and found nothing big enough to show.
          renderMonogram();
        } else {
          renderMonogram();
          findBestIcon(item.url).then((hit) => {
            if (!hit) return;
            const usable = hit.size >= MIN_USABLE_ICON;
            item.autoIcon = usable ? hit.url : "";
            item.autoIconSize = usable ? hit.size : 0;
            item.autoIconFor = host;
            saveState(true);
            if (usable && box.isConnected) {
              box.textContent = "";
              img.src = hit.url;
              box.appendChild(img);
            }
          });
        }
      }
    }

    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = item.title || item.url;

    const actions = document.createElement("div");
    actions.className = "tile-edit-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "tile-action-btn";
    editBtn.title = "Edit shortcut";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openShortcutModal(widget.id, item.id);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "tile-action-btn del";
    delBtn.title = "Delete shortcut";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      widget.items = widget.items.filter((x) => x.id !== item.id);
      saveState(true);
      renderDashboard();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    a.appendChild(actions);
    a.appendChild(box);
    a.appendChild(label);
    return a;
  }

  function moveWidget(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= state.widgets.length) return;
    const [moved] = state.widgets.splice(index, 1);
    state.widgets.splice(next, 0, moved);
    saveState(true);
    renderDashboard();
  }

  function moveShortcutItem(fromWidgetId, itemId, toWidgetId, targetItemId) {
    const fromWidget = state.widgets.find((w) => w.id === fromWidgetId);
    const toWidget = state.widgets.find((w) => w.id === toWidgetId);
    if (!fromWidget || !toWidget) return;

    const fromIdx = fromWidget.items.findIndex((i) => i.id === itemId);
    if (fromIdx === -1) return;
    const [item] = fromWidget.items.splice(fromIdx, 1);

    if (!targetItemId) {
      toWidget.items.push(item);
    } else {
      const targetIdx = toWidget.items.findIndex((i) => i.id === targetItemId);
      if (targetIdx === -1) {
        toWidget.items.push(item);
      } else {
        toWidget.items.splice(targetIdx, 0, item);
      }
    }
    saveState(true);
    renderDashboard();
  }

  function setEditMode(active) {
    isEditMode = active;
    document.body.classList.toggle("is-editing", active);
    document.getElementById("editToolbar").classList.toggle("hidden", !active);
    document.getElementById("toggleEditBtn").textContent = active ? "Done" : "Edit";
    renderDashboard();
  }

  function updateSyncModeUI() {
    const mode = document.getElementById("ghSyncMode").value;
    document.getElementById("ghProfileNameGroup").classList.toggle("hidden", mode === "shared");
  }

  function openSettings() {
    const s = state.settings;
    document.getElementById("settingPageCols").value = String(s.pageCols || 2);
    document.getElementById("settingMaxWidth").value = String(s.maxWidth || 1280);
    document.getElementById("valMaxWidth").textContent = `${s.maxWidth || 1280}px`;
    document.getElementById("settingIconSize").value = String(s.iconSize || 88);
    document.getElementById("valIconSize").textContent = `${s.iconSize || 88}px`;
    document.getElementById("settingIconRadius").value = String(s.iconRadius ?? 18);
    document.getElementById("valIconRadius").textContent = `${s.iconRadius ?? 18}px`;
    document.getElementById("settingGridGap").value = String(s.gridGap || 18);
    document.getElementById("valGridGap").textContent = `${s.gridGap || 18}px`;
    document.getElementById("settingTheme").value = s.theme || "light";
    document.getElementById("settingShowLabels").checked = !!s.showLabels;
    document.getElementById("settingOpenNewTab").checked = !!s.openInNewTab;

    document.getElementById("ghToken").value = syncConfig.token || "";
    document.getElementById("ghRepo").value = syncConfig.repo || "";
    document.getElementById("ghSyncMode").value = syncConfig.syncMode || "separate";
    document.getElementById("ghProfileName").value = syncConfig.profileName || detectBrowserName();
    document.getElementById("ghAutoPush").checked = !!syncConfig.autoPush;
    document.getElementById("ghAutoPull").checked = !!syncConfig.autoPull;
    document.getElementById("ghStatus").textContent = "";
    document.getElementById("ghStatus").className = "status-box";
    updateSyncModeUI();

    document.getElementById("settingsBackdrop").classList.remove("hidden");
  }

  function closeSettings() {
    document.getElementById("settingsBackdrop").classList.add("hidden");
  }

  function updateShortcutIconFields() {
    const type = document.getElementById("scIconType").value;
    document.getElementById("scIconUrlGroup").classList.toggle("hidden", type !== "url");
    document.getElementById("scIconUploadGroup").classList.toggle("hidden", type !== "upload");
    document.getElementById("scMonogramGroup").classList.toggle("hidden", type !== "monogram");
    document.getElementById("scAutoGroup").classList.toggle("hidden", type !== "auto");
  }

  // Icon picker inside the shortcut editor (Icon Source = Auto).
  let autoPick = { host: "", list: null, index: -1, chosen: null };

  function showAutoPreview(hit, note) {
    const img = document.getElementById("scAutoPreview");
    const info = document.getElementById("scAutoInfo");
    if (hit && hit.url) {
      img.src = hit.url;
      img.classList.remove("hidden");
    } else {
      img.removeAttribute("src");
      img.classList.add("hidden");
    }
    info.textContent = note;
  }

  function describeIcon(hit) {
    if (hit.size >= MIN_SHARP_ICON) return `${hit.size} px wide. Sharp.`;
    return `Only ${hit.size} px wide, so it will be shown small to stay sharp.`;
  }

  function resetAutoPick(item) {
    const host = getHost(document.getElementById("scUrl").value);
    autoPick = { host, list: null, index: -1, chosen: null };
    if (item && item.autoIconFor === host && item.autoIcon) {
      showAutoPreview({ url: item.autoIcon }, item.autoIconSize ? describeIcon({ size: item.autoIconSize }) : "Current icon.");
    } else if (item && item.autoIconFor === host) {
      showAutoPreview(null, "No good icon was found, so the tile shows letters. Click the button to see what else exists.");
    } else {
      showAutoPreview(null, "The best icon is picked for you when you save.");
    }
  }

  async function tryAnotherIcon() {
    const urlVal = document.getElementById("scUrl").value;
    const host = getHost(urlVal);
    if (!host) {
      showAutoPreview(null, "Type the website URL first.");
      return;
    }
    if (autoPick.host !== host || !autoPick.list) {
      showAutoPreview(null, "Looking for icons...");
      const list = await findAllIcons(urlVal);
      const itemId = document.getElementById("scItemId").value;
      const widget = state.widgets.find((w) => w.id === document.getElementById("scWidgetId").value);
      const item = widget && itemId ? widget.items.find((i) => i.id === itemId) : null;
      const current = item && item.autoIconFor === host ? item.autoIcon : "";
      autoPick = { host, list, index: list.findIndex((h) => h.url === current), chosen: null };
    }
    if (!autoPick.list.length) {
      showAutoPreview(null, "No icons could be found for this site. Choose Upload Image File or Colored Letter instead.");
      return;
    }
    autoPick.index = (autoPick.index + 1) % autoPick.list.length;
    autoPick.chosen = autoPick.list[autoPick.index];
    showAutoPreview(autoPick.chosen, `Icon ${autoPick.index + 1} of ${autoPick.list.length}. ${describeIcon(autoPick.chosen)}`);
  }

  function openShortcutModal(widgetId, itemId) {
    const widget = state.widgets.find((w) => w.id === widgetId);
    if (!widget) return;
    const item = itemId ? widget.items.find((i) => i.id === itemId) : null;

    document.getElementById("shortcutModalTitle").textContent = item ? "Edit Shortcut" : "Add Shortcut";
    document.getElementById("scWidgetId").value = widgetId;
    document.getElementById("scItemId").value = item ? item.id : "";
    document.getElementById("scTitle").value = item ? item.title : "";
    document.getElementById("scUrl").value = item ? item.url : "";
    document.getElementById("scColSpan").value = String(item ? (item.colSpan || 1) : 1);
    document.getElementById("scRowSpan").value = String(item ? (item.rowSpan || 1) : 1);
    document.getElementById("scIconType").value = item ? (item.iconType || "auto") : "auto";
    document.getElementById("scIconUrl").value = (item && item.iconType === "url") ? item.iconValue : "";
    document.getElementById("scMonogramText").value = (item && item.iconType === "monogram") ? item.iconValue : "";
    document.getElementById("scBgColor").value = (item && item.bgColor) ? item.bgColor : "#f3f4f6";
    document.getElementById("scTextColor").value = (item && item.textColor) ? item.textColor : "#ffffff";
    document.getElementById("scIconFit").value = (item && item.iconFit) ? item.iconFit : "contain";

    pendingUploadedDataUrl = (item && item.iconType === "upload") ? item.iconValue : "";
    const previewWrap = document.getElementById("scUploadPreviewWrap");
    if (pendingUploadedDataUrl) {
      document.getElementById("scUploadPreview").src = pendingUploadedDataUrl;
      document.getElementById("scUploadInfo").textContent = "Saved custom image";
      previewWrap.classList.remove("hidden");
    } else {
      previewWrap.classList.add("hidden");
    }
    document.getElementById("scIconUpload").value = "";

    document.getElementById("deleteShortcutBtn").classList.toggle("hidden", !item);
    resetAutoPick(item);
    updateShortcutIconFields();
    document.getElementById("shortcutModalBackdrop").classList.remove("hidden");
  }

  function closeShortcutModal() {
    document.getElementById("shortcutModalBackdrop").classList.add("hidden");
  }

  function handleIconUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 192;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        pendingUploadedDataUrl = canvas.toDataURL("image/png");
        document.getElementById("scUploadPreview").src = pendingUploadedDataUrl;
        const kb = Math.round((pendingUploadedDataUrl.length * 3) / 4 / 1024);
        document.getElementById("scUploadInfo").textContent = `${width}×${height}px (~${kb} KB)`;
        document.getElementById("scUploadPreviewWrap").classList.remove("hidden");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function openWidgetModal(widgetId) {
    const widget = state.widgets.find((w) => w.id === widgetId);
    if (!widget) return;

    document.getElementById("wgId").value = widget.id;
    document.getElementById("wgTitle").value = widget.title || "";
    document.getElementById("wgPageSpan").value = String(widget.pageSpan || 1);

    const isNote = widget.type === "note";
    document.getElementById("wgShortcutFields").classList.toggle("hidden", isNote);
    document.getElementById("wgNoteFields").classList.toggle("hidden", !isNote);

    if (!isNote) {
      document.getElementById("wgColumns").value = String(widget.columns || 5);
      document.getElementById("wgIconSize").value = String(widget.iconSize || 0);
    } else {
      document.getElementById("wgNoteColor").value = widget.noteColor || "#fce878";
      document.getElementById("wgNoteHeight").value = String(widget.noteHeight || 140);
    }

    document.getElementById("widgetModalBackdrop").classList.remove("hidden");
  }

  function closeWidgetModal() {
    document.getElementById("widgetModalBackdrop").classList.add("hidden");
  }

  // GitHub Repository Sync (automatic branch & per-browser file handling)
  function setGhStatus(msg, isError = false) {
    const el = document.getElementById("ghStatus");
    el.textContent = msg;
    el.className = `status-box ${isError ? "err" : "ok"}`;
  }

  function readSyncConfigFromForm() {
    const parsedRepo = parseRepoInput(document.getElementById("ghRepo").value);
    const repoVal = parsedRepo ? parsedRepo.normalized : document.getElementById("ghRepo").value.trim();
    document.getElementById("ghRepo").value = repoVal;

    const prevRepo = syncConfig.repo;
    syncConfig = {
      token: document.getElementById("ghToken").value.trim(),
      repo: repoVal,
      branch: repoVal === prevRepo ? (syncConfig.branch || "") : "",
      repoIsPrivate: undefined,
      syncMode: document.getElementById("ghSyncMode").value,
      profileName: document.getElementById("ghProfileName").value.trim() || detectBrowserName(),
      autoPush: document.getElementById("ghAutoPush").checked,
      autoPull: document.getElementById("ghAutoPull").checked
    };
    saveSyncConfig(syncConfig);
  }

  function getRepoHeaders(token) {
    return {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": GH_API_VERSION
    };
  }

  async function resolveBranch(parsedRepo, headers) {
    if (syncConfig.branch && typeof syncConfig.repoIsPrivate === "boolean") return syncConfig.branch;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}`,
        { headers, cache: "no-store" }
      );
      if (res.ok) {
        const info = await res.json();
        if (info && info.default_branch) {
          syncConfig.repoIsPrivate = info.private === true;
          syncConfig.branch = info.default_branch;
          saveSyncConfig(syncConfig);
          return info.default_branch;
        }
      }
    } catch {
      // Fallback to main
    }
    return syncConfig.branch || "main";
  }

  async function pushToGitHub(silent = false) {
    if (isPushing) return;
    if (!silent) readSyncConfigFromForm();

    const parsedRepo = parseRepoInput(syncConfig.repo);
    if (!syncConfig.token) {
      if (!silent) setGhStatus("Paste your GitHub token first.", true);
      return;
    }
    if (!parsedRepo) {
      if (!silent) setGhStatus("Paste your GitHub repository link (for example: https://github.com/yourname/your-repo).", true);
      return;
    }

    isPushing = true;
    const headers = getRepoHeaders(syncConfig.token);

    try {
      if (!silent) setGhStatus("Saving to GitHub...");

      const branch = await resolveBranch(parsedRepo, headers);
      if (syncConfig.repoIsPrivate === false) {
        throw new Error("that repository is Public, so anyone on the internet could read your links and notes. Create a separate Private repository on GitHub and paste its link here instead.");
      }
      const repoPath = getAutomaticRepoPath(syncConfig);
      const encodedPath = encodeRepoPath(repoPath);
      const baseUrl = `https://api.github.com/repos/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}/contents/${encodedPath}`;

      let existingSha = undefined;
      const getRes = await fetch(`${baseUrl}?ref=${encodeURIComponent(branch)}`, {
        headers,
        cache: "no-store"
      });

      if (getRes.ok) {
        const existingData = await getRes.json();
        if (existingData && existingData.sha) {
          existingSha = existingData.sha;
        }
      } else if (getRes.status !== 404) {
        const errData = await getRes.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub error (${getRes.status})`);
      }

      const jsonText = JSON.stringify(state, null, 2);
      const label = syncConfig.syncMode === "shared" ? "Shared" : (syncConfig.profileName || detectBrowserName());
      const putBody = {
        message: `Update ${label} dashboard (${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC)`,
        content: utf8ToBase64(jsonText),
        branch
      };
      if (existingSha) {
        putBody.sha = existingSha;
      }

      const putRes = await fetch(baseUrl, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub error (${putRes.status})`);
      }

      const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (!silent) setGhStatus(`Saved (${label}) to GitHub at ${timeStr}.`);
      setBadge(`Saved ${timeStr}`, 3500);
    } catch (err) {
      if (!silent) setGhStatus(`Could not save to GitHub: ${err.message}`, true);
      setBadge("Sync error", 4500);
    } finally {
      isPushing = false;
    }
  }

  async function pullFromGitHub(onlyIfNewer = false) {
    if (!onlyIfNewer) readSyncConfigFromForm();

    const parsedRepo = parseRepoInput(syncConfig.repo);
    if (!syncConfig.token || !parsedRepo) {
      if (!onlyIfNewer) setGhStatus("Enter both your GitHub token and repository link first.", true);
      return;
    }

    const headers = getRepoHeaders(syncConfig.token);

    try {
      if (!onlyIfNewer) setGhStatus("Loading from GitHub...");
      const branch = await resolveBranch(parsedRepo, headers);
      const repoPath = getAutomaticRepoPath(syncConfig);
      const encodedPath = encodeRepoPath(repoPath);
      const url = `https://api.github.com/repos/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

      const res = await fetch(url, { headers, cache: "no-store" });

      if (res.status === 404) {
        if (!onlyIfNewer) {
          const label = syncConfig.syncMode === "shared" ? "Shared" : (syncConfig.profileName || detectBrowserName());
          setGhStatus(`No backup found yet for "${label}". Click "Save to GitHub Now" first.`, true);
        }
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub error (${res.status})`);
      }

      const data = await res.json();
      let rawText = "";
      if (data.content) {
        rawText = base64ToUtf8(data.content);
      } else if (data.download_url) {
        const rawRes = await fetch(data.download_url, { cache: "no-store" });
        if (!rawRes.ok) throw new Error(`Could not download backup (${rawRes.status})`);
        rawText = await rawRes.text();
      } else {
        throw new Error("Backup file was empty.");
      }

      const remoteState = JSON.parse(rawText);
      if (!remoteState || !Array.isArray(remoteState.widgets)) {
        throw new Error("Backup file did not contain valid dashboard data.");
      }

      if (onlyIfNewer && state.updatedAt && remoteState.updatedAt) {
        if (new Date(remoteState.updatedAt) <= new Date(state.updatedAt)) {
          return;
        }
      }

      remoteState.settings = Object.assign(createDefaultState().settings, remoteState.settings || {});
      state = remoteState;
      saveState(false);
      renderDashboard();

      const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (!onlyIfNewer) setGhStatus(`Loaded latest dashboard from GitHub at ${timeStr}.`);
      setBadge(`Updated ${timeStr}`, 3500);
    } catch (err) {
      if (!onlyIfNewer) setGhStatus(`Could not load from GitHub: ${err.message}`, true);
    }
  }

  // ---------------------------------------------------------------------
  // App updates. The dashboard is served from GitHub Pages and kept in an
  // offline cache by sw.js so new tabs open instantly. version.json is the
  // single source of truth: the copy in the cache is "installed", the copy
  // on the network is "latest". Nothing here ever touches keyboard focus.
  // ---------------------------------------------------------------------
  const UPDATE_CHECK_KEY = "custom_newtab_last_update_check";
  const UPDATE_CHECK_EVERY_MS = 15 * 60 * 1000;
  const isHosted = location.protocol === "https:" || location.protocol === "http:";
  let installedVersion = "";
  let latestInfo = null;

  function setUpdateStatus(msg, isError = false) {
    const el = document.getElementById("updateStatus");
    el.textContent = msg;
    el.className = `status-box ${isError ? "err" : "ok"}`;
  }

  async function readVersion(fresh) {
    const url = fresh ? `version.json?check=${Date.now()}` : "version.json";
    const res = await fetch(url, fresh ? { cache: "no-store" } : {});
    if (!res.ok) throw new Error(`could not read version (${res.status})`);
    return res.json();
  }

  function showUpdateAvailable(info) {
    latestInfo = info;
    const btn = document.getElementById("updateAvailableBtn");
    btn.textContent = `Update to ${info.version}`;
    btn.title = info.notes ? `What's new: ${info.notes}` : "A new version is ready";
    btn.classList.remove("hidden");
    document.getElementById("updateNowBtn").classList.remove("hidden");
  }

  async function checkForUpdate(manual) {
    try {
      if (!installedVersion) {
        installedVersion = (await readVersion(false)).version || "";
        document.getElementById("installedVersion").textContent = installedVersion || "unknown";
      }
      if (!isHosted) {
        if (manual) setUpdateStatus("This copy was installed from a downloaded folder, so it cannot update itself. Install the small New Tab wrapper from the README to get one-click updates.", true);
        return;
      }
      if (!manual) {
        const last = Number(localStorage.getItem(UPDATE_CHECK_KEY) || 0);
        if (Date.now() - last < UPDATE_CHECK_EVERY_MS) return;
      }
      if (manual) setUpdateStatus("Checking...");
      const latest = await readVersion(true);
      localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()));
      if (latest.version && latest.version !== installedVersion) {
        showUpdateAvailable(latest);
        if (manual) setUpdateStatus(`Version ${latest.version} is available.${latest.notes ? " What's new: " + latest.notes : ""}`);
      } else if (manual) {
        setUpdateStatus(`You have the latest version (${installedVersion}).`);
      }
    } catch (err) {
      if (manual) setUpdateStatus(`Could not check for updates: ${err.message}. Are you online?`, true);
    }
  }

  async function applyUpdate() {
    try {
      setBadge("Updating...");
      setUpdateStatus("Updating...");
      // Make sure the new version is reachable before throwing the old copy away.
      await readVersion(true);
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }
      localStorage.removeItem(UPDATE_CHECK_KEY);
      location.reload();
    } catch (err) {
      setBadge("Update failed", 4500);
      setUpdateStatus(`Could not update: ${err.message}. Your current version is untouched.`, true);
    }
  }

  function initUpdates() {
    if (isHosted && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {
        // Without the offline cache the page simply loads from the network.
      });
    }
    document.getElementById("updateAvailableBtn").addEventListener("click", applyUpdate);
    document.getElementById("updateNowBtn").addEventListener("click", applyUpdate);
    document.getElementById("checkUpdateBtn").addEventListener("click", () => checkForUpdate(true));
    checkForUpdate(false);
  }

  function bindEvents() {
    document.getElementById("toggleEditBtn").addEventListener("click", () => setEditMode(!isEditMode));
    document.getElementById("doneEditBtn").addEventListener("click", () => setEditMode(false));
    document.getElementById("openSettingsBtn").addEventListener("click", openSettings);
    document.getElementById("closeSettingsBtn").addEventListener("click", closeSettings);
    document.getElementById("ghSyncMode").addEventListener("change", updateSyncModeUI);

    document.getElementById("settingsBackdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeSettings();
    });

    document.getElementById("addShortcutWidgetBtn").addEventListener("click", () => {
      state.widgets.push({
        id: uid("w"),
        type: "shortcuts",
        title: "New Widget",
        pageSpan: 1,
        columns: 5,
        iconSize: 0,
        items: []
      });
      saveState(true);
      renderDashboard();
    });

    document.getElementById("addNoteWidgetBtn").addEventListener("click", () => {
      state.widgets.push({
        id: uid("w"),
        type: "note",
        title: "note",
        pageSpan: 1,
        noteColor: "#fce878",
        noteHeight: 140,
        content: ""
      });
      saveState(true);
      renderDashboard();
    });

    document.getElementById("settingPageCols").addEventListener("change", (e) => {
      state.settings.pageCols = Number(e.target.value);
      saveState(true);
      renderDashboard();
    });

    document.getElementById("settingMaxWidth").addEventListener("input", (e) => {
      state.settings.maxWidth = Number(e.target.value);
      document.getElementById("valMaxWidth").textContent = `${state.settings.maxWidth}px`;
      applyThemeAndVars();
    });
    document.getElementById("settingMaxWidth").addEventListener("change", () => saveState(true));

    document.getElementById("settingIconSize").addEventListener("input", (e) => {
      state.settings.iconSize = Number(e.target.value);
      document.getElementById("valIconSize").textContent = `${state.settings.iconSize}px`;
      applyThemeAndVars();
    });
    document.getElementById("settingIconSize").addEventListener("change", () => saveState(true));

    document.getElementById("settingIconRadius").addEventListener("input", (e) => {
      state.settings.iconRadius = Number(e.target.value);
      document.getElementById("valIconRadius").textContent = `${state.settings.iconRadius}px`;
      applyThemeAndVars();
    });
    document.getElementById("settingIconRadius").addEventListener("change", () => saveState(true));

    document.getElementById("settingGridGap").addEventListener("input", (e) => {
      state.settings.gridGap = Number(e.target.value);
      document.getElementById("valGridGap").textContent = `${state.settings.gridGap}px`;
      applyThemeAndVars();
    });
    document.getElementById("settingGridGap").addEventListener("change", () => saveState(true));

    document.getElementById("settingTheme").addEventListener("change", (e) => {
      state.settings.theme = e.target.value;
      saveState(true);
      applyThemeAndVars();
    });

    document.getElementById("settingShowLabels").addEventListener("change", (e) => {
      state.settings.showLabels = e.target.checked;
      saveState(true);
      applyThemeAndVars();
    });

    document.getElementById("settingOpenNewTab").addEventListener("change", (e) => {
      state.settings.openInNewTab = e.target.checked;
      saveState(true);
      renderDashboard();
    });

    document.getElementById("ghSaveConfigBtn").addEventListener("click", () => {
      readSyncConfigFromForm();
      setGhStatus("Settings saved.");
    });
    document.getElementById("ghPushBtn").addEventListener("click", () => pushToGitHub(false));
    document.getElementById("ghPullBtn").addEventListener("click", () => pullFromGitHub(false));

    document.getElementById("exportJsonBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `newtab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById("importJsonBtn").addEventListener("click", () => {
      document.getElementById("importJsonFile").click();
    });

    document.getElementById("importJsonFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || !Array.isArray(parsed.widgets)) throw new Error("Invalid format");
          parsed.settings = Object.assign(createDefaultState().settings, parsed.settings || {});
          state = parsed;
          saveState(true);
          renderDashboard();
          openSettings();
          setGhStatus("Backup restored.");
        } catch {
          setGhStatus("Could not restore file: invalid backup format.", true);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    document.getElementById("resetDefaultsBtn").addEventListener("click", (e) => {
      confirmByClick(e.currentTarget, () => {
        state = createDefaultState();
        saveState(true);
        renderDashboard();
        closeSettings();
      });
    });

    document.getElementById("scIconType").addEventListener("change", updateShortcutIconFields);
    document.getElementById("scAutoTryBtn").addEventListener("click", tryAnotherIcon);
    document.getElementById("scUrl").addEventListener("change", () => resetAutoPick(null));
    document.getElementById("scIconUpload").addEventListener("change", (e) => handleIconUpload(e.target.files[0]));
    document.getElementById("closeShortcutModalBtn").addEventListener("click", closeShortcutModal);
    document.getElementById("cancelShortcutBtn").addEventListener("click", closeShortcutModal);
    document.getElementById("shortcutModalBackdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeShortcutModal();
    });

    document.getElementById("deleteShortcutBtn").addEventListener("click", () => {
      const widgetId = document.getElementById("scWidgetId").value;
      const itemId = document.getElementById("scItemId").value;
      const widget = state.widgets.find((w) => w.id === widgetId);
      if (widget && itemId) {
        widget.items = widget.items.filter((i) => i.id !== itemId);
        saveState(true);
        renderDashboard();
      }
      closeShortcutModal();
    });

    document.getElementById("shortcutForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const widgetId = document.getElementById("scWidgetId").value;
      const itemId = document.getElementById("scItemId").value;
      const widget = state.widgets.find((w) => w.id === widgetId);
      if (!widget) return;

      const iconType = document.getElementById("scIconType").value;
      let iconValue = "";
      if (iconType === "url") iconValue = document.getElementById("scIconUrl").value.trim();
      else if (iconType === "upload") iconValue = pendingUploadedDataUrl;
      else if (iconType === "monogram") iconValue = document.getElementById("scMonogramText").value.trim();

      const updated = {
        id: itemId || uid("s"),
        title: document.getElementById("scTitle").value.trim(),
        url: normalizeUrl(document.getElementById("scUrl").value),
        colSpan: Number(document.getElementById("scColSpan").value) || 1,
        rowSpan: Number(document.getElementById("scRowSpan").value) || 1,
        iconType,
        iconValue,
        bgColor: document.getElementById("scBgColor").value,
        textColor: document.getElementById("scTextColor").value,
        iconFit: document.getElementById("scIconFit").value
      };

      // Keep the automatic icon: the one just picked in this editor, or the
      // one already remembered, as long as the website has not changed.
      const newHost = getHost(updated.url);
      const previous = itemId ? widget.items.find((i) => i.id === itemId) : null;
      if (autoPick.chosen && autoPick.host === newHost) {
        updated.autoIcon = autoPick.chosen.url;
        updated.autoIconSize = autoPick.chosen.size;
        updated.autoIconFor = newHost;
      } else if (previous && previous.autoIconFor === newHost) {
        updated.autoIcon = previous.autoIcon;
        updated.autoIconSize = previous.autoIconSize;
        updated.autoIconFor = previous.autoIconFor;
      }

      if (itemId) {
        const idx = widget.items.findIndex((i) => i.id === itemId);
        if (idx !== -1) widget.items[idx] = updated;
      } else {
        widget.items.push(updated);
      }

      saveState(true);
      renderDashboard();
      closeShortcutModal();
    });

    document.getElementById("closeWidgetModalBtn").addEventListener("click", closeWidgetModal);
    document.getElementById("cancelWidgetBtn").addEventListener("click", closeWidgetModal);
    document.getElementById("widgetModalBackdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeWidgetModal();
    });

    document.getElementById("deleteWidgetBtn").addEventListener("click", (e) => {
      const id = document.getElementById("wgId").value;
      confirmByClick(e.currentTarget, () => {
        state.widgets = state.widgets.filter((w) => w.id !== id);
        saveState(true);
        renderDashboard();
        closeWidgetModal();
      });
    });

    document.getElementById("widgetForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("wgId").value;
      const widget = state.widgets.find((w) => w.id === id);
      if (!widget) return;

      widget.title = document.getElementById("wgTitle").value.trim();
      widget.pageSpan = Number(document.getElementById("wgPageSpan").value) || 1;
      if (widget.type === "shortcuts") {
        widget.columns = Math.max(1, Math.min(12, Number(document.getElementById("wgColumns").value) || 5));
        widget.iconSize = Math.max(0, Number(document.getElementById("wgIconSize").value) || 0);
      } else if (widget.type === "note") {
        widget.noteColor = document.getElementById("wgNoteColor").value;
        widget.noteHeight = Math.max(80, Number(document.getElementById("wgNoteHeight").value) || 140);
      }

      saveState(true);
      renderDashboard();
      closeWidgetModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeShortcutModal();
        closeWidgetModal();
        closeSettings();
      }
    });
  }

  bindEvents();
  renderDashboard();
  initUpdates();

  if (syncConfig.autoPull && syncConfig.token && syncConfig.repo) {
    pullFromGitHub(true);
  }
})();
