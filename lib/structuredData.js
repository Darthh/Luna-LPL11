export const SITE_URL = "https://lunaterminal.com";
export const SITE_NAME = "Luna Terminal";

export const organizationLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  description:
    "A free financial terminal for traders and financial advisors with market dashboards, stock research, screeners, portfolio analytics, and institutional holdings.",
});

export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
});
