// Design prototype shell. Query string: ?direction=civic|commons|record&theme=light|dark&app=hub|charter|board|ledger
// Wraps <template id="page"> in the AppShell layout (sidebar, top bar with
// SuiteSwitcher, OrgSwitcher, BillingBanner and user menu). Not shipped.
(function () {
  const q = new URLSearchParams(location.search);
  const direction = q.get("direction") || "civic";
  const theme = q.get("theme") || "light";
  const app = q.get("app") || document.documentElement.dataset.app || "hub";
  const root = document.documentElement;
  root.dataset.app = app;
  root.dataset.direction = direction;
  if (theme === "dark") root.classList.add("dark");
  if (direction === "suite") {
    // The chosen system: the real shared tokens. They load no fonts, so add Inter here.
    document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">');
    document.write('<link rel="stylesheet" href="../../../shared/design/tokens.css">');
  } else {
    document.write(`<link rel="stylesheet" href="tokens/${direction}.css">`);
  }

  const I = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
    bank: '<path d="M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7"/>',
    tree: '<path d="M12 3v6M6 15v-3h12v3M6 15v6M18 15v6M12 9v3"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  };
  window.icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ""}</svg>`;

  const APPS = {
    hub: { name: "OpenAppHub", mark: "H", nav: [["home", "Dashboard"], ["users", "Members"], ["card", "Billing"], ["gear", "Settings"]] },
    charter: { name: "OpenCharterApp", mark: "C", nav: [["home", "Overview"], ["users", "Members"], ["tree", "Chapters"], ["card", "Payments"], ["chart", "Reports"], ["gear", "Settings"]] },
    board: { name: "OpenBoardApp", mark: "B", nav: [["home", "Overview"], ["cal", "Meetings"], ["check", "Tasks"], ["file", "Documents"], ["users", "Members"], ["gear", "Settings"]] },
    ledger: { name: "OpenLedgerApp", mark: "L", nav: [["home", "Dashboard"], ["swap", "Transactions"], ["bank", "Accounts"], ["target", "Budgets"], ["chart", "Reports"], ["gear", "Settings"]] },
  };

  window.addEventListener("DOMContentLoaded", () => {
    const tpl = document.getElementById("page");
    if (!tpl) return;
    const a = APPS[app];
    const current = document.body.dataset.current || a.nav[0][1];
    const banner = document.body.dataset.banner === "trial"
      ? `<div class="banner" role="status">${icon("info")}<span>Your free trial ends in <strong>12 days</strong>. Everything stays yours: you can export at any time.</span><a href="#">Choose a plan</a></div>`
      : "";
    const shell = document.createElement("div");
    shell.className = "shell";
    shell.innerHTML = `
      <aside class="sidebar" aria-label="${a.name}">
        <div class="brand"><span class="brand-mark">${a.mark}</span>${a.name}</div>
        <nav class="nav">${a.nav
          .map(([ic, label]) => `<a href="#" ${label === current ? 'aria-current="page"' : ""}>${icon(ic)}${label}</a>`)
          .join("")}</nav>
        <div class="sidebar-foot nav"><a href="#">${icon("help")}Help</a></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" aria-label="Open menu">${icon("menu")}</button>
          <button class="switcher" aria-label="Switch app">${icon("grid")}<span class="hide-phone">${a.name}</span></button>
          <button class="switcher org-switcher"><span class="dot"></span><span class="org-name">Riverside Community Association</span>${icon("chev")}</button>
          <span class="spacer"></span>
          <button class="icon-btn hide-phone" aria-label="Help">${icon("help")}</button>
          <span class="avatar" aria-label="Account menu">MR</span>
        </header>
        ${banner}
        <main class="content"></main>
      </div>`;
    shell.querySelector(".content").appendChild(tpl.content.cloneNode(true));
    document.body.prepend(shell);
    const overlay = document.getElementById("overlay");
    if (overlay) document.body.appendChild(overlay.content.cloneNode(true));
    document.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon)));
  });
})();
