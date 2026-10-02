// Server-rendered FAQ. The text is the point: the FAQPage JSON-LD alongside it
// only helps if the same answers exist as readable prose in the HTML.
export default function FaqSection({ items, heading = "Frequently asked questions" }) {
  return (
    <section className="faq-section">
      <h2>{heading}</h2>
      {items.map(([question, answer]) => (
        <div className="faq-item" key={question}>
          <h3>{question}</h3>
          <p>{answer}</p>
        </div>
      ))}
    </section>
  );
}
