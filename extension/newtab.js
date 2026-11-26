// This wrapper never changes. All real code lives on GitHub Pages and is
// shown in the frame above. Do not add anything here that takes keyboard
// focus: the cursor has to stay in the browser's address bar.
(() => {
  const frame = document.getElementById("app");
  const offline = document.getElementById("offline");
  const appOrigin = new URL(frame.src).origin;

  let timer = setTimeout(() => { offline.hidden = false; }, 6000);

  window.addEventListener("message", (event) => {
    if (event.origin !== appOrigin || !event.data || event.data.type !== "cnt-ready") return;
    clearTimeout(timer);
    offline.hidden = true;
    const bg = String(event.data.bg || "");
    if (/^rgba?\([\d\s.,/%]+\)$/.test(bg)) {
      document.documentElement.style.background = bg;
      document.body.style.background = bg;
      try { localStorage.setItem("dashboard_bg", bg); } catch {}
    }
  });

  document.getElementById("retry").addEventListener("click", () => {
    offline.hidden = true;
    const src = frame.src;
    frame.src = src;
    timer = setTimeout(() => { offline.hidden = false; }, 6000);
  });
})();
