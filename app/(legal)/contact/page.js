export const metadata = {
  title: "Contact Us",
  description: "Contact Luna Terminal with questions, suggestions, or feedback.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="legal-wrap">
      <h1>Contact Us</h1>
      <p>
        Have a question about Luna Terminal, an idea for a new feature, or a suggestion for how
        we can improve the site? We&apos;d be glad to hear from you.
      </p>
      <p>
        Email us at{" "}
        <a href="mailto:patrickv.disc@gmail.com">patrickv.disc@gmail.com</a>. We&apos;ll respond as
        soon as we can.
      </p>
    </div>
  );
}
