// Company logos come from Parqet's public logo CDN, keyed by ticker. Not
// every symbol resolves (foreign lines, recent listings, some ETFs), so every
// caller renders the <img> with an onError that hides it rather than leaving a
// broken-image box behind.
//
// Tickers whose CDN entry is wrong or missing get a local override.
import { MANAGER_LOGOS } from "@/lib/managerLogos";

export const LOGO_OVERRIDES = {
  SPCX: { src: "/logos/spacex.png" },
};

export function logoUrl(symbol, size = 64) {
  const override = LOGO_OVERRIDES[symbol]?.src;
  if (override) return override;

  // Keep the CDN as an upstream implementation detail. Our image route
  // returns the same PNG but advertises a 30-day immutable cache lifetime,
  // instead of asking each visitor to revalidate the CDN's one-day response.
  return (
    `/api/logo?symbol=${encodeURIComponent(symbol)}&size=${encodeURIComponent(size)}`
  );
}

// Shared onError handlers: drop the image instead of showing a broken icon.
// Which one to use depends on whether the row still needs the space - in a
// aligned list or table the gap has to stay, so the logo is only made
// invisible rather than removed from the layout.
export function hideBrokenLogo(e) {
  e.currentTarget.style.display = "none";
}

export function blankBrokenLogo(e) {
  e.currentTarget.style.visibility = "hidden";
}

// News thumbnails, unlike logos, hold no slot worth keeping: a story card
// reflows around the missing picture rather than leaving a gap, so the element
// goes rather than being hidden.
export function dropBrokenImage(e) {
  e.currentTarget.remove();
}

const GENERIC_FIRM_WORD =
  /^(inc|corp|corporation|co|llc|lp|llp|ltd|plc|group|holding|holdings|advisors|advisers|management|capital|partners|associates|the|and|of|international|investment|investments|investor|investors|fund|funds|asset|trading|securities|bank|banque|global|america|americas)$/i;

// A 13F filer's logo. Firms whose own shares trade resolve to their ticker's
// art; the rest fall through to the letter tile /api/logo draws, keyed on the
// firm's name so it reads as that firm's initials rather than a blank square.
export function managerLogoUrl(cik, name, ticker, size = 64) {
  const local = MANAGER_LOGOS[cik]?.src;
  if (local) return local;
  if (ticker) return logoUrl(ticker, size);
  // /api/logo takes a symbol, not a sentence: letters and digits, 12 at most,
  // no spaces. So the firm's distinguishing word becomes the tile - "Jane
  // Street Group, LLC" tiles as JANE, "Citadel Advisors LLC" as CITADEL - and
  // the legal and generic words come off first so every partnership on the
  // roster doesn't tile as the same LLC.
  const word = String(name ?? "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .find((w) => !GENERIC_FIRM_WORD.test(w));
  return logoUrl((word ?? "FUND").slice(0, 12).toUpperCase(), size);
}
