"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import UpcomingEvents from "./UpcomingEvents";
import PopularStocksCard from "./PopularStocksCard";
import AlertsPanel from "./AlertsPanel";
import WatchlistMovers from "./WatchlistMovers";
import MarketMovers from "./MarketMovers";
import { useLanguage } from "./LanguageProvider";
import NotificationSettings from "./NotificationSettings";

// The far-right rail: icons only, each opening a panel over the page. The
// terminal keeps a handful of things permanently reachable without giving them
// standing screen space, which is what an icon strip buys over a fixed column -
// the workspace stays as wide as the data.
//
// Labels live in a tooltip on hover and in aria-label always, so the strip is
// readable to a screen reader and to anyone who does not recognise a glyph.

const svg = (children) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    {children}
  </svg>
);

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ProfileIcon = svg(
  <>
    <circle cx="12" cy="8.5" r="3.5" {...stroke} />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...stroke} />
  </>
);

const EventsIcon = svg(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" {...stroke} />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" {...stroke} />
  </>
);

const TrendingIcon = svg(
  <>
    <path d="M3.5 16.5 9 11l4 4 7.5-7.5" {...stroke} />
    <path d="M15 7.5h5.5V13" {...stroke} />
  </>
);

const WatchlistIcon = svg(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" {...stroke} />
    <path d="M7 9h10M7 12.5h10M7 16h6" {...stroke} />
  </>
);

const FlameIcon = svg(
  <>
    <path
      d="M12 3.5c3 3 4.5 5.2 4.5 8a4.5 4.5 0 0 1-9 0c0-1.3.5-2.4 1.4-3.4.3 1.5 1 2.2 1.8 2.2.9 0 1.3-.8 1.3-2.4 0-1.5-.3-2.9-1-4.4Z"
      {...stroke}
    />
    <path d="M6.5 15.5a5.5 5.5 0 0 0 11 0" {...stroke} />
  </>
);

const BellIcon = svg(
  <>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" {...stroke} />
    <path d="M10 19a2 2 0 0 0 4 0" {...stroke} />
  </>
);

export default function TerminalRail() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  // An open flyout closes on a click anywhere else and on Escape - the same
  // two gestures every other menu on the site closes with.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback((id) => setOpen((cur) => (cur === id ? null : id)), []);

  // Alerts belong to an account, so signed out that button leads to signing in
  // rather than opening an empty panel.
  const items = [
    { id: "profile", label: session?.user ? t("Profile") : t("Sign in"), icon: ProfileIcon },
    { id: "events", label: t("Upcoming events"), icon: EventsIcon },
    { id: "popular", label: t("Most popular stocks"), icon: TrendingIcon },
    { id: "watchlist", label: t("My watchlist"), icon: WatchlistIcon },
    { id: "movers", label: t("Market movers"), icon: FlameIcon },
    { id: "alerts", label: t("Notifications"), icon: BellIcon },
    { id: "add-alert", label: t("Add notifications"), icon: svg(<path d="M12 5v14M5 12h14" {...stroke} />) },
  ];

  return (
    <aside className="trail" ref={ref}>
      <div className="trail-strip">
        {items.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            className={open === id ? "trail-btn active" : "trail-btn"}
            onClick={() => toggle(id)}
            aria-label={label}
            aria-expanded={open === id}
          >
            {icon}
            {/* Shown on hover and on keyboard focus, so the label is reachable
                without a pointer. */}
            <span className="trail-tip">{label}</span>
          </button>
        ))}
      </div>

      {open && (
        <div className="trail-flyout" role="dialog" aria-label={items.find((i) => i.id === open)?.label}>
          <header className="trail-flyout-head">
            <h2>{items.find((i) => i.id === open)?.label}</h2>
            <button type="button" onClick={() => setOpen(null)} aria-label={t("Close")}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" {...stroke} />
              </svg>
            </button>
          </header>
          <div className="trail-flyout-body">
            {open === "add-alert" && <NotificationSettings />}
            {open === "profile" && <ProfilePanel session={session} t={t} />}
            {open === "events" && <UpcomingEvents />}
            {open === "popular" && <PopularStocksCard />}
            {open === "watchlist" && <WatchlistMovers />}
            {open === "movers" && <MarketMovers />}
            {open === "alerts" &&
              (session?.user ? (
                <AlertsPanel />
              ) : (
                <p className="trail-empty">
                  {t("Sign in to set market sentiment alerts.")}
                </p>
              ))}
          </div>
        </div>
      )}
    </aside>
  );
}

// The account panel is a short list of links rather than a second settings
// menu - the header already has one, and duplicating it would mean two places
// that have to agree.
function ProfilePanel({ session, t }) {
  if (!session?.user) {
    return <p className="trail-empty">{t("Sign in to use watchlists, alerts and API keys.")}</p>;
  }
  return (
    <div className="trail-links">
      <div className="trail-who">
        <strong>{session.user.name || session.user.email}</strong>
        {session.user.name && <span>{session.user.email}</span>}
      </div>
      <Link href="/watchlist">{t("My watchlist")}</Link>
      <Link href="/alerts">{t("My alerts")}</Link>
    </div>
  );
}
