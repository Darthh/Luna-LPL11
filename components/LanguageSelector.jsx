"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";

const LANGUAGES = [
  { code: "en", flagCode: "us", label: "English" },
  { code: "zh", flagCode: "cn", label: "中文" },
  { code: "uk", flagCode: "ua", label: "Українська" },
  { code: "th", flagCode: "th", label: "ไทย" },
  { code: "de", flagCode: "de", label: "Deutsch" },
  { code: "fr", flagCode: "fr", label: "Français" },
  { code: "pt", flagCode: "br", label: "Português" },
  { code: "ko", flagCode: "kr", label: "한국어" },
  { code: "es", flagCode: "es", label: "Español" },
];

function Flag({ code }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img className="language-flag" src={`https://flagcdn.com/${code}.svg`} alt="" width="16" height="12" />;
}

export default function LanguageSelector() {
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const selected = LANGUAGES.find((language) => language.code === locale) ?? LANGUAGES[0];

  useEffect(() => {
    function closeOnClickAway(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnClickAway);
    return () => document.removeEventListener("mousedown", closeOnClickAway);
  }, []);

  function chooseLanguage(code) {
    setLocale(code);
    setOpen(false);
  }

  return (
    <div className="opt language-setting" ref={menuRef}>
      <span>{t("Language")}</span>
      <div className="language-select-wrap">
        <button
          type="button"
          className="language-select-button"
          aria-label={t("Language")}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        >
          <Flag code={selected.flagCode} />
          <span>{selected.label}</span>
          <svg className="language-select-chevron" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div className="language-options" role="listbox" aria-label={t("Language")}>
            {LANGUAGES.map((language) => (
              <button
                type="button"
                role="option"
                aria-selected={locale === language.code}
                className={`language-option${locale === language.code ? " selected" : ""}`}
                key={language.code}
                onClick={() => chooseLanguage(language.code)}
              >
                <Flag code={language.flagCode} />
                <span>{language.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
