import Link from "next/link";

export const metadata = { title: "Page not found" };

// Next's built-in 404 renders unstyled, outside the theme, and offers no way
// onward. This one stays inside the app's chrome and points at the pages
// people are usually looking for when a URL goes stale.
export default function NotFound() {
  return (
    <main className="notfound-page">
      <p className="notfound-code">404</p>
      <h2>We couldn&apos;t find that page.</h2>
      <p className="notfound-note">
        The link may be out of date, or the ticker in it may no longer trade. Try a search from the
        header, or pick up from one of these.
      </p>
      <nav className="notfound-links" aria-label="Suggested pages">
        <Link href="/" className="nav-link">
          Luna Terminal chart
        </Link>
        <Link href="/screener" className="nav-link">
          Stock screener
        </Link>
        <Link href="/maps" className="nav-link">
          Stock maps
        </Link>
        <Link href="/watchlist" className="nav-link">
          Your watchlist
        </Link>
      </nav>
    </main>
  );
}
