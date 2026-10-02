import WelcomeHome from "@/components/WelcomeHome";

export const metadata = {
  title: "About Luna Terminal - Free Financial Research Platform",
  description:
    "Meet Luna Terminal, a free financial research platform for live markets, stock analysis, screeners, portfolios, institutional holdings, advisor tools, and private local AI.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <WelcomeHome />;
}
