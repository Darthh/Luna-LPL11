// Structured data. Server-rendered into the initial HTML like everything else
// that matters for indexing. JSON.stringify output is escaped for the one
// character that can break out of a <script> block.
export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
