"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import DashboardProvider from "@/components/DashboardProvider";
import TerminalNav from "@/components/TerminalNav";
import TerminalRail from "@/components/TerminalRail";
import BackgroundEffects from "@/components/BackgroundEffects";
import RsiLeNotifier from "@/components/RsiLeNotifier";
import { DEFAULTS, FONTS, KEYS, THEME_PATTERN } from "@/lib/appearance";

// Charts read their colors from CSS variables, so they have to redraw when the
// theme changes; they take the current theme as a prop purely to retrigger that.
const ThemeContext = createContext(DEFAULTS.theme);
export const useTheme = () => useContext(ThemeContext);

// The chrome every route shares: the animated backdrop and the header, plus the
// appearance preferences they both read. Rendered once from the root layout -
// it used to be a byte-identical copy in each route's layout.js.
//
// All four preferences are applied to <html> by the blocking script in
// app/layout.js before paint; this only mirrors them into React state so the
// settings menu can show and change the current values.
export default function PageChrome({ children }) {
  const pathname = usePathname();
  const [appearance, setAppearance] = useState(DEFAULTS);

  useEffect(() => {
    const d = document.documentElement;
    const frame = requestAnimationFrame(() => {
      setAppearance({
        theme: d.dataset.theme || DEFAULTS.theme,
        pattern: d.dataset.pattern || DEFAULTS.pattern,
        density: d.dataset.density || DEFAULTS.density,
        weight: d.dataset.weight || DEFAULTS.weight,
        sidebar: d.dataset.sidebar || DEFAULTS.sidebar,
        // A font that has since been removed leaves a stale preference behind,
        // so fall back rather than seeding state with a name FONTS no longer has.
        font: FONTS[localStorage.getItem(KEYS.font)] ? localStorage.getItem(KEYS.font) : DEFAULTS.font,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const change = useCallback(
    (key, value) => {
      const next = { ...appearance, [key]: value };
      // A palette and its background were designed together, so picking a theme
      // also moves the background to that theme's own.
      if (key === "theme") next.pattern = THEME_PATTERN[value] || "none";

      const d = document.documentElement;
      d.dataset.theme = next.theme;
      d.dataset.pattern = next.pattern;
      d.dataset.density = next.density;
      d.dataset.weight = next.weight;
      d.dataset.sidebar = next.sidebar;
      d.style.setProperty("--font-ui", FONTS[next.font] || FONTS[DEFAULTS.font]);
      try {
        localStorage.setItem(KEYS.theme, next.theme);
        localStorage.setItem(KEYS.pattern, next.pattern);
        localStorage.setItem(KEYS.density, next.density);
        localStorage.setItem(KEYS.font, next.font);
        localStorage.setItem(KEYS.weight, next.weight);
        localStorage.setItem(KEYS.sidebar, next.sidebar);
      } catch {}
      setAppearance(next);
    },
    [appearance]
  );

  if (pathname === "/" || pathname === "/about") {
    return children;
  }

  return (
    <>
      <BackgroundEffects pattern={appearance.pattern} />
      <Header appearance={appearance} onAppearanceChange={change} />
      <ThemeContext.Provider value={appearance.theme}>
        {/* The dashboard arrangement is shared by the page that renders it and
            the rail that toggles panels, so it is provided around both. */}
        <DashboardProvider>
        {/* The terminal shell: nav rail, page, quote rail. It is the shell
            now - the single-column page it grew out of was a second layout to
            keep working for every change, and nothing here needs two. */}
        <div className="terminal-shell">
          <TerminalNav />
          <div id="content">{children}</div>
          <TerminalRail />
        </div>
        <RsiLeNotifier />
        </DashboardProvider>
      </ThemeContext.Provider>
    </>
  );
}
