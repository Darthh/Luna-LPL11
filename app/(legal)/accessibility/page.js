export const metadata = { title: "Accessibility & CC", description: "Accessibility information and closed-caption support for Luna Terminal.", alternates: { canonical: "/accessibility" } };

export default function AccessibilityPage() {
  return (
    <div className="legal-wrap">
      <h1>Accessibility &amp; CC</h1>
      <p>
        Luna Terminal aims to be usable by as many people as possible, including those using
        assistive technologies such as screen readers and keyboard navigation.
      </p>
      <p>
        We&apos;re continuing to improve color contrast, keyboard support, and semantic markup
        across the site. If you encounter an accessibility barrier, please let us know through the
        site&apos;s support channels so we can address it.
      </p>
    </div>
  );
}
