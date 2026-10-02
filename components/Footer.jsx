import Link from "next/link";
import { VERSION } from "@/lib/changelog";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <nav className="footer-links" aria-label="Footer">
        <Link href="/about">About</Link>
        <Link href="/terms">Terms of Use</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/accessibility">Accessibility &amp; CC</Link>
        <Link href="/contact">Contact Us</Link>
      </nav>
      <div className="footer-copyright">Luna Terminal &copy; {year}. All rights reserved.</div>
      <span className="footer-version">{VERSION}</span>
    </footer>
  );
}
