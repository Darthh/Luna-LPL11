"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronIcon, NAV_LINKS } from "@/lib/navigation";
import { useLanguage } from "./LanguageProvider";
import { useDashboard } from "./DashboardProvider";
import { CHAT_HISTORY_EVENT, deleteChat, readChats, searchChats } from "@/lib/chatHistory";

// A roof over a door: the overview every other page hangs off.
const HomeIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M9.5 21v-6h5v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

const ChatIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    <path d="m10 14 9-9 2 2-9 9-3 1zM17 7l2 2" />
  </svg>
);

// The left rail of the terminal: every destination on screen at once, grouped
// the way the old header menus grouped them, rather than hidden behind hover
// menus. This is the change that makes the site read as a workspace instead of
// a website - a terminal shows you where you can go without asking.
//
// The tree itself is lib/navigation.jsx, shared with the top bar so a new page
// is added once.

// Collapsed state and which sections are open both persist: a rail that forgets
// how you left it is a rail you re-arrange on every navigation.
const KEYS = { collapsed: "navCollapsed", open: "navOpenSections" };

// Sections start open. The rail exists so every destination is visible without
// asking - starting it closed would just rebuild the hover menus it replaced,
// one click deeper. What the reader collapses is remembered from then on.
function readPrefs() {
  const open = Object.fromEntries(
    NAV_LINKS.filter((l) => l.items).map((l) => [l.label, true])
  );
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.open) ?? "null");
    return {
      collapsed: localStorage.getItem(KEYS.collapsed) === "1",
      // Merged rather than replaced, so a section added after the reader last
      // set their preferences appears open instead of missing from the object
      // and rendering shut.
      open: saved ? { ...open, ...saved } : open,
    };
  } catch {
    return { collapsed: false, open };
  }
}


export default function TerminalNav() {
  const pathname = usePathname();
  const { t } = useLanguage();
  // One state object, so restoring the saved preferences after hydration is a
  // single set rather than one per field. The server renders the defaults -
  // every section open, rail expanded - and localStorage is read in the effect
  // below, which is the only place it exists.
  const [prefs, setPrefs] = useState(() => ({
    collapsed: false,
    open: Object.fromEntries(
      NAV_LINKS.filter((l) => l.items).map((l) => [l.label, true])
    ),
  }));
  const { collapsed, open } = prefs;
  const [allChats, setAllChats] = useState([]);
  const [chatQuery, setChatQuery] = useState("");
  const dashboard = useDashboard();
  const router = useRouter();
  // Set when a click could not add a panel because the dashboard is full. A
  // click that silently does nothing reads as a broken button.
  const [blocked, setBlocked] = useState(null);
  // The configurable widget dashboard lives at /dashboard; "/" is the
  // market overview, which has no widgets to toggle.
  const pathnameIsHome = pathname === "/dashboard";

  // A nav entry that maps to a dashboard widget toggles it rather than
  // navigating. Off the dashboard it navigates there first, because toggling a
  // panel you cannot see is a click that appears to do nothing.
  const onWidgetClick = useCallback(
    (event, id) => {
      event.preventDefault();
      if (!pathnameIsHome) {
        if (!dashboard.has(id)) dashboard.add(id);
        router.push("/dashboard");
        return;
      }
      if (!dashboard.toggle(id)) {
        setBlocked(id);
        window.setTimeout(() => setBlocked((cur) => (cur === id ? null : cur)), 2200);
      }
    },
    [dashboard, pathnameIsHome, router]
  );

  useEffect(() => {
    // set-state-in-effect is the point here, not an oversight: localStorage
    // only exists after hydration, and the first render has to match the
    // server's markup, so the saved preferences cannot be read any earlier.
    // Mount-only - re-running on pathname would slam shut a section the reader
    // had just opened by hand.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readPrefs());
    setAllChats(readChats());
    const refreshChats = () => setAllChats(readChats());
    window.addEventListener(CHAT_HISTORY_EVENT, refreshChats);
    window.addEventListener("storage", refreshChats);
    return () => {
      window.removeEventListener(CHAT_HISTORY_EVENT, refreshChats);
      window.removeEventListener("storage", refreshChats);
    };
  }, []);

  const toggleCollapsed = useCallback(() => {
    setPrefs((p) => {
      const collapsed = !p.collapsed;
      try {
        localStorage.setItem(KEYS.collapsed, collapsed ? "1" : "0");
      } catch {}
      return { ...p, collapsed };
    });
  }, []);

  const toggleSection = useCallback((label) => {
    setPrefs((p) => {
      const open = { ...p.open, [label]: !p.open[label] };
      try {
        localStorage.setItem(KEYS.open, JSON.stringify(open));
      } catch {}
      return { ...p, open };
    });
  }, []);

  // A hash link points at a section of the dashboard. Which section is in view
  // is not something the router knows, so none of them is marked current.
  const isActive = (href) => !href.includes("#") && pathname === href;

  // Highlighted only when the panel is actually on the dashboard - and only on
  // the dashboard page, since that is the only place the dashboard exists.
  const onDashboard = (id) => pathnameIsHome && dashboard.has(id);
  const visibleChats = chatQuery.trim() ? searchChats(allChats, chatQuery) : allChats.slice(0, 3);

  const removeChat = useCallback((chat) => {
    if (!window.confirm(`Delete “${chat.title}”? This cannot be undone.`)) return;
    if (!deleteChat(chat.id)) return;
    if (pathname === `/dashboard/chat/${chat.id}`) {
      window.dispatchEvent(new Event("luna-new-chat"));
      router.replace("/dashboard/chat");
    }
  }, [pathname, router]);

  return (
    <nav className="tnav" data-collapsed={collapsed ? "true" : "false"} aria-label={t("Main")}>
      <button
        type="button"
        className="tnav-collapse"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        title={collapsed ? t("Expand sidebar") : t("Collapse sidebar")}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="tnav-collapse-label">{t("Collapse")}</span>
      </button>

      <div className="tnav-scroll">
        {/* The dashboard is the first thing in the rail: it is the page every
            other destination here is a deeper cut of. */}
        <Link
          href="/dashboard"
          className={pathname === "/dashboard" ? "tnav-item top active" : "tnav-item top"}
          title={collapsed ? t("Home") : undefined}
        >
          <span className="tnav-icon">{HomeIcon}</span>
          <span className="tnav-label">{t("Home")}</span>
        </Link>

        <Link
          href="/dashboard/chat"
          className={pathname === "/dashboard/chat" ? "tnav-item top active" : "tnav-item top"}
          onClick={() => window.dispatchEvent(new Event("luna-new-chat"))}
          title={collapsed ? t("New chat") : undefined}
        >
          <span className="tnav-icon">{ChatIcon}</span>
          <span className="tnav-label">{t("New chat")}</span>
        </Link>
        {allChats.length > 0 && (
          <div className="tnav-recent" aria-label={t("Recent chats")}>
            <label className="tnav-chat-search">
              <span className="sr-only">{t("Search past chats")}</span>
              <input
                type="search"
                value={chatQuery}
                onChange={(event) => setChatQuery(event.target.value)}
                placeholder={t("Search past chats")}
              />
            </label>
            {visibleChats.map((chat) => (
              <div className="tnav-chat-row" key={chat.id}>
                <Link href={`/dashboard/chat/${encodeURIComponent(chat.id)}`}
                  className={pathname === `/dashboard/chat/${chat.id}` ? "tnav-item active" : "tnav-item"}
                  title={collapsed ? chat.title : undefined}>
                  <span className="tnav-label">{chat.title}</span>
                </Link>
                <button type="button" className="tnav-chat-delete" onClick={() => removeChat(chat)} aria-label={`${t("Delete chat")}: ${chat.title}`} title={t("Delete chat")}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            ))}
            {chatQuery.trim() && visibleChats.length === 0 && <p className="tnav-chat-empty">{t("No matching chats")}</p>}
          </div>
        )}

        {NAV_LINKS.map(({ href, label, icon, items, badge, widget }) =>
          items ? (
            <div className="tnav-section" key={label}>
              <button
                type="button"
                className="tnav-section-head"
                onClick={() => toggleSection(label)}
                aria-expanded={Boolean(open[label])}
                title={collapsed ? t(label) : undefined}
              >
                <span className="tnav-icon">{icon}</span>
                <span className="tnav-label">{t(label)}</span>
                <span className="tnav-chevron" data-open={open[label] ? "true" : "false"}>
                  {ChevronIcon}
                </span>
              </button>
              {/* Kept mounted and hidden rather than unmounted, so collapsing a
                  section does not throw away the links' focus order. */}
              <div className="tnav-items" hidden={!open[label]}>
                {items.map((item) =>
                  item.widget ? (
                    <button
                      key={item.href}
                      type="button"
                      className={onDashboard(item.widget) ? "tnav-item on" : "tnav-item"}
                      data-blocked={blocked === item.widget ? "true" : undefined}
                      onClick={(e) => onWidgetClick(e, item.widget)}
                      aria-pressed={onDashboard(item.widget)}
                      title={collapsed ? t(item.label) : undefined}
                    >
                      <span className="tnav-icon">{item.icon}</span>
                      <span className="tnav-label">{t(item.label)}</span>
                      {item.badge && <span className="tnav-badge">{item.badge}</span>}
                      {/* A dot rather than a tick: it marks the row without
                          moving the label, and reads at icon-only width too. */}
                      {onDashboard(item.widget) && <span className="tnav-dot" aria-hidden="true" />}
                      {blocked === item.widget && <span className="tnav-full">{t("full")}</span>}
                    </button>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={isActive(item.href) ? "tnav-item active" : "tnav-item"}
                      title={collapsed ? t(item.label) : undefined}
                    >
                      <span className="tnav-icon">{item.icon}</span>
                      <span className="tnav-label">{t(item.label)}</span>
                      {item.badge && <span className="tnav-badge">{item.badge}</span>}
                    </Link>
                  )
                )}
              </div>
            </div>
          ) : widget ? (
            <button
              key={href}
              type="button"
              className={onDashboard(widget) ? "tnav-item top on" : "tnav-item top"}
              data-blocked={blocked === widget ? "true" : undefined}
              onClick={(e) => onWidgetClick(e, widget)}
              aria-pressed={onDashboard(widget)}
              title={collapsed ? t(label) : undefined}
            >
              <span className="tnav-icon">{icon}</span>
              <span className="tnav-label">{t(label)}</span>
              {badge && <span className="tnav-badge">{badge}</span>}
              {onDashboard(widget) && <span className="tnav-dot" aria-hidden="true" />}
              {blocked === widget && <span className="tnav-full">{t("full")}</span>}
            </button>
          ) : (
            <Link
              key={href}
              href={href}
              className={isActive(href) ? "tnav-item top active" : "tnav-item top"}
              title={collapsed ? t(label) : undefined}
            >
              <span className="tnav-icon">{icon}</span>
              <span className="tnav-label">{t(label)}</span>
              {badge && <span className="tnav-badge">{badge}</span>}
            </Link>
          )
        )}
      </div>

    </nav>
  );
}
