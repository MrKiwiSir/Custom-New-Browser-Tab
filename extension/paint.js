// Paint the last known dashboard background straight away so there is no
// white flash before the dashboard arrives.
try {
  const bg = localStorage.getItem("dashboard_bg");
  if (bg) document.documentElement.style.background = bg;
} catch {}
