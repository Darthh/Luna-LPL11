import { FONTS, FONT_OPTIONS } from "@/lib/appearance";

export const metadata = {
  title: "Font preview",
  description: "Side-by-side specimens of every UI font the appearance settings offer.",
  // A scratch page for comparing faces, not something to index.
  robots: { index: false, follow: false },
};

// Pangrams and figures, because the differences between these faces show up in
// the letterforms you actually read and in how numbers line up in a table.
const SPECIMEN = "The quick brown fox jumps over the lazy dog";
const FIGURES = "0123456789 $773.17 −2.4% SPY/QQQ";

export default function FontPreviewPage() {
  return (
    <main style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>Font preview</h1>
      <p style={{ opacity: 0.7, marginBottom: "2.5rem" }}>
        Every face in Settings → Font, rendered with the same copy. {FONT_OPTIONS.length} total.
      </p>

      {FONT_OPTIONS.map(([key, label]) => (
        <section key={key} style={{ marginBottom: "3rem", fontFamily: FONTS[key] }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.75rem",
              borderBottom: "1px solid currentColor",
              opacity: 0.999,
              paddingBottom: "0.4rem",
              marginBottom: "1rem",
            }}
          >
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{label}</h2>
            <code style={{ fontSize: "0.75rem", opacity: 0.6 }}>{key}</code>
          </div>
          <p style={{ fontSize: "2rem", lineHeight: 1.15, margin: "0 0 0.75rem" }}>{SPECIMEN}</p>
          <p style={{ fontSize: "1.125rem", margin: "0 0 0.75rem" }}>{SPECIMEN}</p>
          <p style={{ fontSize: "0.875rem", margin: "0 0 0.75rem" }}>{SPECIMEN}</p>
          <p style={{ fontSize: "1.125rem", margin: 0, fontVariantNumeric: "tabular-nums" }}>{FIGURES}</p>
        </section>
      ))}
    </main>
  );
}
