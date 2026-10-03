"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AuthButtons from "./AuthButtons";
import SettingsMenu from "./SettingsMenu";
import WatchlistButton from "./WatchlistButton";
import BrandMark from "./BrandMark";
import { useLanguage } from "./LanguageProvider";

import { ALL_LINKS, ChevronIcon, NAV_LINKS } from "@/lib/navigation";


function NavMenu({ label, icon, items, pathname }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const active = items.some((i) => !i.href.includes("#") && i.href === pathname);

  return (
    <div className="nav-menu" ref={ref}>
      <button
        type="button"
        className={active ? "nav-link active" : "nav-link"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {icon}
        {label}
        {ChevronIcon}
      </button>
      {open && (
        <div className="nav-menu-panel">
          {items.map(({ href, label: itemLabel, icon: itemIcon }) => (
            <Link
              key={href}
              href={href}
              className={!href.includes("#") && href === pathname ? "nav-menu-item active" : "nav-menu-item"}
              onClick={() => setOpen(false)}
            >
              {itemIcon}
              {itemLabel}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header({ appearance, onAppearanceChange }) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const searchRef = useRef(null);
  const navValue = ALL_LINKS.some((l) => l.href === pathname) ? pathname : "";

  const { t } = useLanguage();

  // Debounced ticker autocomplete.
  useEffect(() => {
    const q = search.trim();
    const timer = setTimeout(
      () => {
        if (!q) {
          setSuggestions([]);
          setActiveIdx(-1);
          return;
        }
        fetch(`/api/stock-search?q=${encodeURIComponent(q)}`)
          .then((res) => res.json())
          .then((json) => {
            setSuggestions(json.results ?? []);
            setActiveIdx(-1);
          })
          .catch(() => setSuggestions([]));
      },
      q ? 200 : 0
    );
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  function openStock(ticker) {
    if (!ticker) return;
    window.open(`/stock/${encodeURIComponent(ticker)}`, "_blank", "noopener");
    setSearch("");
    setSuggestions([]);
    setOpen(false);
  }

  function submitSearch(e) {
    e.preventDefault();
    const pick = activeIdx >= 0 ? suggestions[activeIdx]?.symbol : null;
    openStock(pick ?? search.trim().toUpperCase());
  }

  function onSearchKeyDown(e) {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <header className="site">
      <Link href="/dashboard" className="brand-link">
        <div className="logo" aria-hidden="true">
          <BrandMark size={30} />
          <span className="halloween-mark" />
        </div>
        <h1>{t("Luna Terminal")}</h1>
      </Link>
      {/* Search sits directly beside the brand rather than centred: the tagline
          that used to hold this slot is gone, and a lone spacer here only
          pushed the field into the middle of empty space. */}
      <div className="header-search-wrap" ref={searchRef}>
        {/* wider ticker search */}
        <form className="header-search" onSubmit={submitSearch} role="search">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder={t("Search for stocks, tickers, companies")}
            aria-label={t("Search for stocks, tickers, companies")}
            spellCheck={false}
          />
        </form>
        {open && suggestions.length > 0 && (
          <div className="header-search-menu">
            {suggestions.map((s, i) => (
              <div className="header-search-row" key={s.symbol} onMouseEnter={() => setActiveIdx(i)}>
                <button
                  type="button"
                  className={`header-search-item${i === activeIdx ? " active" : ""}`}
                  onClick={() => openStock(s.symbol)}
                >
                  <span className="header-search-symbol">{s.symbol}</span>
                  <span className="header-search-name">{s.name}</span>
                  <span className="header-search-exch">{s.exchange}</span>
                </button>
                <WatchlistButton symbol={s.symbol} name={s.name} onError={setSaveError} />
              </div>
            ))}
            {saveError && <p className="header-search-error">{saveError}</p>}
          </div>
        )}
      </div>
      <div className="site-spacer" />
      {NAV_LINKS.map(({ href, label, icon, items, badge }) => {
        if (items) {
          return <NavMenu key={label} label={t(label)} icon={icon} items={items.map((item) => ({ ...item, label: t(item.label) }))} pathname={pathname} />;
        }
        // The in-page anchor never counts as "the page you're on" - otherwise
        // it and Home would both light up everywhere on the home route.
        const active = !href.includes("#") && pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={active ? "nav-link active" : "nav-link"}
            aria-current={active ? "page" : undefined}
          >
            {icon}
            {t(label)}
            {badge && <span className="nav-badge">{badge}</span>}
          </Link>
        );
      })}
      {/* The same destinations as one control, for phones. A native
          <select> means the OS draws the scrollable list - on iOS and Android
          that's the full-height wheel, which beats anything we'd hand-roll.
          It and the pills swap at 880px; see globals.css. */}
      <select
        className="nav-select"
        value={navValue}
        onChange={(e) => e.target.value && router.push(e.target.value)}
        aria-label="Go to page"
      >
        {/* /stock/AAPL and the like aren't in the list, so there has to be
            something for the select to show while you're on one. */}
        {!navValue && <option value="">{t("Menu")}</option>}
        {NAV_LINKS.map(({ href, label, items }) =>
          items ? (
            <optgroup key={label} label={t(label)}>
              {items.map((i) => (
                <option key={i.href} value={i.href}>
                  {t(i.label)}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={href} value={href}>
              {t(label)}
            </option>
          )
        )}
      </select>
      <div className="header-account-cluster">
        <Link href="/about" className="auth-btn header-about-link">About</Link>
        <AuthButtons />
      </div>
      <SettingsMenu appearance={appearance} onAppearanceChange={onAppearanceChange} />
    </header>
  );
}
