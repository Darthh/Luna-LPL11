import Image from "next/image";
import Link from "next/link";
import BrandMark from "./BrandMark";

export default function WelcomeHome() {
  return (
    <main id="content" className="intro-page">
      <section className="intro-hero intro-film" aria-labelledby="intro-title">
        <video autoPlay muted loop playsInline preload="metadata" poster="/welcome/welcome2.png" aria-hidden="true">
          <source src="/welcome/welcome3.mp4" type="video/mp4" />
          Your browser does not support background video.
        </video>
        <div className="intro-film-shade" aria-hidden="true" />
        <div className="intro-hero-content">
          <div className="intro-kicker">
            <Image src="/lilo-moon-dark.png" alt="" width={22} height={22} unoptimized />
            <span>Luna Terminal</span>
          </div>
          <h1 id="intro-title">See the markets in a new light.</h1>
          <p>
            Live markets, stock research, screeners, portfolio analytics, and advisor tools in one
            focused workspace. Free to use. Built for decisions.
          </p>
          <div className="intro-actions">
            <Link href="/dashboard" className="intro-primary">
              <span>Open Luna Terminal</span><span aria-hidden="true">→</span>
            </Link>
            <a href="#platform" className="intro-text-link">Explore the platform</a>
          </div>
        </div>
      </section>

      <section className="intro-statement" id="platform" aria-labelledby="platform-title">
        <p className="intro-section-label">The platform</p>
        <h2 id="platform-title">Your financial research home.</h2>
        <p className="intro-section-copy">
          Move from the market-wide picture to a single company, portfolio, or filing without
          rebuilding your workspace at every turn.
        </p>
        <div className="intro-metrics" aria-label="Platform highlights">
          <div><strong>25</strong><span>public research views</span></div>
          <div><strong>1</strong><span>connected workspace</span></div>
          <div><strong>$0</strong><span>terminal subscription</span></div>
        </div>
      </section>

      <section className="intro-feature intro-feature-research" aria-labelledby="research-title">
        <div className="intro-feature-copy">
          <p className="intro-section-label">Research, connected</p>
          <h2 id="research-title">Follow an idea all the way through.</h2>
          <p>
            Start with market sentiment. Open the stock. Check fundamentals, earnings, price
            history, valuation, ownership, and supply-chain context without leaving Luna.
          </p>
          <Link href="/stock/NVDA" className="intro-inline-link">Explore stock research <span>→</span></Link>
        </div>
        <div className="terminal-art">
          <Image
            className="terminal-art-image"
            src="/welcome/stock-research.png"
            alt="Luna Terminal stock research page for Advanced Micro Devices"
            width={1276}
            height={806}
            sizes="(max-width: 900px) calc(100vw - 32px), 58vw"
          />
        </div>
      </section>

      <section className="intro-tools" id="tools" aria-labelledby="tools-title">
        <div className="intro-tools-heading">
          <p className="intro-section-label">Full toolkit</p>
          <h2 id="tools-title">The market from more than one angle.</h2>
          <p>Use the view that fits the question, then move straight into the underlying research.</p>
        </div>
        <div className="intro-tool-links">
          <Link href="/dashboard"><span>01</span><strong>Market dashboard</strong><small>Sentiment, events, movers, watchlists</small><i>→</i></Link>
          <Link href="/screener"><span>02</span><strong>Stock screener</strong><small>Filter the market by the metrics that matter</small><i>→</i></Link>
          <Link href="/maps"><span>03</span><strong>Maps &amp; relationships</strong><small>See sectors, portfolios, and supply chains</small><i>→</i></Link>
          <Link href="/hedge-funds"><span>04</span><strong>Institutional holdings</strong><small>Explore public 13F portfolios over time</small><i>→</i></Link>
        </div>
      </section>

      <section className="intro-orbit" aria-label="Luna tools orbit illustration">
        <div className="orbit-rings" aria-hidden="true">
          <span className="orbit-ring orbit-one" /><span className="orbit-ring orbit-two" />
          <span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" />
          <BrandMark size={260} darkOnly />
        </div>
        <p>Markets move together.<br />Your tools should too.</p>
      </section>

      <section className="intro-audience" id="built-for" aria-labelledby="audience-title">
        <p className="intro-section-label">Built for the work</p>
        <h2 id="audience-title">One terminal. Two points of view.</h2>
        <div className="intro-audience-grid">
          <article>
            <span>For traders</span>
            <h3>Find the signal, then test the story.</h3>
            <p>Watch markets, screen ideas, study price action, compare valuation, and track catalysts in a fast research loop.</p>
            <Link href="/dashboard">Enter the market workspace →</Link>
          </article>
          <article>
            <span>For financial advisors</span>
            <h3>See the client picture without losing the market.</h3>
            <p>Compare portfolios, organize models, review performance, create reports, and connect holdings to current research.</p>
            <Link href="/client-portfolios">Explore advisor tools →</Link>
          </article>
        </div>
      </section>

      <section className="intro-mission">
        <p className="intro-section-label">Why Luna</p>
        <blockquote>
          Financial research should feel like a clear night sky: wide enough to show the whole
          picture, focused enough to find what matters.
        </blockquote>
      </section>

      <section className="intro-close" aria-labelledby="close-title">
        <Image
          src="/brand/luna-wordmark-light.png"
          alt="Luna Terminal"
          width={2172}
          height={724}
          className="intro-wordmark"
        />
        <h2 id="close-title">The market is already moving.</h2>
        <Link href="/dashboard" className="intro-primary"><span>Open the terminal</span><span aria-hidden="true">→</span></Link>
      </section>

      <section className="intro-downloads" id="desktop-downloads" aria-labelledby="desktop-downloads-title">
        <p className="intro-section-label">Luna on your computer</p>
        <div className="intro-downloads-heading">
          <div>
            <h2 id="desktop-downloads-title">Run Luna Terminal locally.</h2>
            <p>
              Open the familiar Luna workspace on Windows or Mac, switch between Luna and Dark
              themes, and chat privately with models installed through Ollama.
            </p>
          </div>
          <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="intro-text-link">
            Install Ollama first →
          </a>
        </div>
        <div className="intro-download-grid">
          <a href="/downloads/Luna-Terminal-win-x64.exe" download>
            <span>Windows</span><strong>Download .exe</strong><small>64-bit Intel / AMD</small><i>↓</i>
          </a>
          <a href="/downloads/Luna-Terminal-mac-arm64.dmg" download>
            <span>macOS</span><strong>Download .dmg</strong><small>Apple silicon</small><i>↓</i>
          </a>
          <a href="/downloads/Luna-Terminal-mac-x64.dmg" download>
            <span>macOS</span><strong>Download .dmg</strong><small>Intel</small><i>↓</i>
          </a>
        </div>
        <p className="intro-download-note">
          Download a model once with <code>ollama pull llama3.2</code>, then local chat can run
          offline. Live quotes and market data still require an internet connection.
        </p>
      </section>

      <footer className="intro-footer">
        <div><BrandMark size={34} darkOnly /><span>Luna Terminal</span></div>
        <nav aria-label="About page footer">
          <Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>
          <Link href="/accessibility">Accessibility</Link><Link href="/contact">Contact</Link>
        </nav>
        <p>Research software. Not investment advice.</p>
      </footer>
    </main>
  );
}
