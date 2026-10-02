"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LOCALES, translate } from "@/lib/translations";

const STORAGE_KEY = "siteLanguage";
const LanguageContext = createContext({ locale: "en", t: (value) => value, setLocale: () => {} });

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!LOCALES.includes(stored)) return;
    const timer = window.setTimeout(() => setLocaleState(stored), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function setLocale(nextLocale) {
    if (!LOCALES.includes(nextLocale)) return;
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : nextLocale;
    setLocaleState(nextLocale);
  }

  const value = useMemo(
    () => ({ locale, setLocale, t: (copy) => translate(locale, copy) }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
