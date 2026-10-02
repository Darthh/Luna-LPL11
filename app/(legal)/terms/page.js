export const metadata = { title: "Terms of Use", description: "Terms governing the use of Luna Terminal and its market research tools.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <div className="legal-wrap">
      <h1>Terms of Use</h1>
      <p>
        Luna Terminal is provided for informational and educational purposes only. Nothing on
        this site constitutes financial, investment, or trading advice, and no content should be
        relied upon as the basis for any investment decision.
      </p>
      <p>
        Market data, including index levels, commodity prices, and sentiment indicators, is
        sourced from third parties and may be delayed, incomplete, or inaccurate. Luna Terminal
        makes no warranties about the accuracy, completeness, or timeliness of any data displayed.
      </p>
      <p>
        By using this site, you agree that Luna Terminal is not liable for any losses or damages
        arising from your use of, or reliance on, the information provided.
      </p>
    </div>
  );
}
