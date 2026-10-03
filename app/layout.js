import "./globals.css";
import "./halloween.css";
import "./padres.css";
import "./sidebar.css";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { WatchlistProvider } from "@/components/WatchlistProvider";
import PageChrome from "@/components/PageChrome";
import Footer from "@/components/Footer";
import { LanguageProvider } from "@/components/LanguageProvider";
import {
  DEFAULTS,
  DENSITIES,
  FONTS,
  KEYS,
  PATTERNS,
  THEMES,
  THEME_PATTERN,
  WEIGHTS,
} from "@/lib/appearance";
import JsonLd from "@/components/JsonLd";
import WebMcpTools from "@/components/WebMcpTools";
import { organizationLd, websiteLd, SITE_NAME, SITE_URL } from "@/lib/structuredData";

const SITE_DESCRIPTION =
  "A free financial terminal for traders and financial advisors with live market dashboards, stock research, screeners, maps, earnings, portfolio analytics, and institutional holdings.";

// Titles lead with what nothing else does - the index overlaid on an arbitrary
// ticker with a correlation coefficient - rather than the generic "comparison
// tool" wording, which competed with every charting site for nothing.
const TITLE_TEMPLATE = {
  default: "Luna Terminal - Free Financial Research for Traders and Advisors",
  template: "%s | Luna Terminal",
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE_TEMPLATE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "free financial terminal",
    "stock research platform",
    "financial advisor tools",
    "stock screener",
    "market dashboard",
    "portfolio analytics",
    "13F holdings",
  ],
  category: "finance",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: "/manifest.webmanifest",
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  openGraph: {
    title: TITLE_TEMPLATE.default,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    // "summary" renders a small square thumbnail beside the text; the large
    // card is the one that shows the reading big enough to read in a feed.
    card: "summary_large_image",
    title: TITLE_TEMPLATE.default,
    description: SITE_DESCRIPTION,
  },
};

// The CSS asked for Inter but nothing ever loaded it, so every visitor fell
// through to their system UI font. Geist Mono carries every number on the site.
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

// One more UI face the settings menu can pick, shipped as a local woff2.
//
// The file is a single static master with no bold cut, so it is declared at
// weight 400 only. That is deliberate: claiming a "100 900" range here would
// tell the browser the face already covers bold, which suppresses synthetic
// bolding and makes the Text weight setting do nothing on this font. Declared
// at one weight, the browser synthesizes the heavier steps instead.
const interWoff = localFont({
  src: "./fonts/InterWoff.woff2",
  variable: "--font-inter-woff",
  display: "swap",
  weight: "400",
});

// Every appearance preference is applied to <html> before first paint, so the
// page never flashes the default theme, background or font on the way in.
const themeInitScript = `(function(){
var T=${JSON.stringify(THEMES)},P=${JSON.stringify(PATTERNS.map(([v]) => v))},F=${JSON.stringify(FONTS)},D=${JSON.stringify(DENSITIES.map(([v]) => v))},W=${JSON.stringify(WEIGHTS.map(([v]) => v))},TP=${JSON.stringify(THEME_PATTERN)},K=${JSON.stringify(KEYS)},X=${JSON.stringify(DEFAULTS)};
var d=document.documentElement;
try{
var t=localStorage.getItem(K.theme);
/* The Luna palette shipped as "lpl" first. Without this line anyone who
   picked it then would silently land on the default instead. */
if(t==='lpl'||t==='light'){t='luna';localStorage.setItem(K.theme,t);}
if(T.indexOf(t)===-1)t=X.theme;d.dataset.theme=t;
var p=localStorage.getItem(K.pattern);if(P.indexOf(p)===-1)p=TP[t]||'none';d.dataset.pattern=p;
var f=localStorage.getItem(K.font);if(!F[f])f=X.font;d.style.setProperty('--font-ui',F[f]);
var n=localStorage.getItem(K.density);if(D.indexOf(n)===-1)n=X.density;d.dataset.density=n;
var w=localStorage.getItem(K.weight);if(W.indexOf(w)===-1)w=X.weight;d.dataset.weight=w;
var s=localStorage.getItem(K.sidebar);d.dataset.sidebar=['small','medium','large'].indexOf(s)===-1?X.sidebar:s;
}catch(e){d.dataset.theme=X.theme;}
})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme={DEFAULTS.theme}
      data-pattern={DEFAULTS.pattern}
      data-density={DEFAULTS.density}
      data-weight={DEFAULTS.weight}
      data-layout="terminal"
      className={`${sans.variable} ${mono.variable} ${interWoff.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <AuthSessionProvider>
          <WatchlistProvider>
            <LanguageProvider>
              <PageChrome>{children}</PageChrome>
              <Footer />
            </LanguageProvider>
          </WatchlistProvider>
        </AuthSessionProvider>
        <WebMcpTools />
        <JsonLd data={organizationLd()} />
        <JsonLd data={websiteLd()} />
      </body>
    </html>
  );
}
