"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCapShort } from "@/lib/formatCap";
import { addMonths } from "@/lib/earningsCalendar";

const SESSIONS = [
  { key: "time-pre-market", label: "Before Open", icon: "sun" },
  { key: "time-after-hours", label: "After Close", icon: "moon" },
];
const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MONTH_TILE_LIMIT = 12;

const SunIcon = () => (
  <svg viewBox="0 0 24 24" className="earnings-session-icon" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" className="earnings-session-icon" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" className="earnings-none-icon" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4m8-4v4M3 11h18" />
  </svg>
);

const ArrowIcon = ({ direction = 1 }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" style={{ transform: `scaleX(${direction})` }}>
    <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
  </svg>
);

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const fmt = (iso, options) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${iso}T12:00:00.000Z`));

const formatDay = (iso) => fmt(iso, { weekday: "long" });
const formatDayNumber = (iso) => fmt(iso, { month: "short", day: "numeric" });
// The reference heads each column "Mon 31" - short weekday, bare day number.
const formatWeekday = (iso) => fmt(iso, { weekday: "short" });
const formatDayOfMonth = (iso) => fmt(iso, { day: "numeric" });
const formatMonth = (iso) => fmt(`${iso}-01`, { month: "long", year: "numeric" });

function formatWeek(start) {
  return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(addDays(start, 4), {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

// Logos come through /api/logo rather than the CDN directly: the proxy resolves
// dotted share classes and draws a lettered tile for the few symbols with no
// art anywhere, so it always answers with an image and there is no broken-logo
// case to handle. The art itself is passed through untouched.
//
// v bumps whenever the proxy changes what bytes it returns. Responses are
// cached immutable for a month, so without it a browser that saw the old
// alpha-stripped logos keeps showing them - which is why AVGO rendered as a
// bare white mark with its red plate missing long after the proxy stopped
// stripping alpha.
const LOGO_VERSION = 2;
function CompanyLogo({ company, size }) {
  return (
    <span className="earnings-logo" data-size={size} aria-hidden="true">
      <img
        src={`/api/logo?symbol=${encodeURIComponent(company.symbol)}&size=128&v=${LOGO_VERSION}`}
        alt=""
        loading="lazy"
      />
    </span>
  );
}

// One company in the weekly grid: a big logo tile with the ticker beneath it,
// the way the reference lays them out. The name and cap ride along in the
// tooltip rather than on the tile, which keeps every tile the same size no
// matter how long the company name is.
function CompanyTile({ company, move }) {
  return (
    <a
      className="earnings-tile"
      href={`/stock/${encodeURIComponent(company.symbol)}`}
      title={`${company.name}${company.marketCapValue ? ` · ${formatCapShort(company.marketCapValue)}` : ""}${
        company.epsForecast === "N/A" ? "" : ` · EPS ${company.epsForecast}`
      }${move ? ` · Implied move ±${move.percent.toFixed(1)}%` : ""}`}
    >
      <CompanyLogo company={company} size="tile" />
      <span className="earnings-tile-symbol">{company.symbol}</span>
      {/* The slot holds its height whether or not a move resolved, so tiles
          stay on a common baseline instead of jittering as the second pass
          lands - and so a row of tiles does not reflow under the cursor. */}
      <span className="earnings-tile-move">
        {move ? `±${move.percent.toFixed(1)}%` : ""}
      </span>
    </a>
  );
}

function Session({ day, session, moves }) {
  const companies = day.companies.filter((company) => company.session === session.key);
  if (!companies.length) return null;
  return (
    <section className="earnings-session" aria-label={`${session.label} on ${formatDay(day.date)}`}>
      <header>
        {session.icon === "sun" ? <SunIcon /> : <MoonIcon />}
        <strong>{session.label}</strong>
      </header>
      <div className="earnings-tiles">
        {companies.map((company) => (
          <CompanyTile company={company} move={moves[company.symbol]} key={company.symbol} />
        ))}
      </div>
    </section>
  );
}

function DayColumn({ day, moves }) {
  const tbd = day.companies.filter((company) => company.session === "time-not-supplied");
  const sessions = SESSIONS.filter((session) =>
    day.companies.some((company) => company.session === session.key)
  );
  const empty = !sessions.length && !tbd.length;

  return (
    <article className="earnings-day">
      <header className="earnings-day-head">
        <h2>{formatWeekday(day.date)}</h2>
        <span>{formatDayOfMonth(day.date)}</span>
        {day.unavailable && <small>Feed unavailable</small>}
      </header>
      {empty ? (
        <p className="earnings-none"><CalendarIcon />No Earnings</p>
      ) : (
        <div className="earnings-day-body">
          {sessions.map((session) => (
            <Session day={day} session={session} moves={moves} key={session.key} />
          ))}
          {!!tbd.length && (
            <section className="earnings-session" aria-label={`Time TBD on ${formatDay(day.date)}`}>
              <header><strong>Time TBD</strong></header>
              <div className="earnings-tiles">
                {tbd.map((company) => (
                  <CompanyTile company={company} move={moves[company.symbol]} key={company.symbol} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </article>
  );
}

// Month cells carry logos only - the tile grid from the reference. Past the
// visible limit the rest collapses into a +N chip rather than letting one cell
// grow taller than the others in its row.
function MonthCell({ day, inMonth }) {
  const shown = day.companies.slice(0, MONTH_TILE_LIMIT);
  const overflow = day.companies.length - shown.length;
  return (
    <article className="earnings-month-cell" data-outside={inMonth ? undefined : "true"}>
      <header>
        <span>{formatDayNumber(day.date)}</span>
        {day.unavailable && <small>Feed down</small>}
      </header>
      {shown.length ? (
        <div className="earnings-month-tiles">
          {shown.map((company) => (
            <a
              key={company.symbol}
              href={`/stock/${encodeURIComponent(company.symbol)}`}
              title={`${company.symbol} · ${company.name}${company.marketCapValue ? ` · ${formatCapShort(company.marketCapValue)}` : ""}`}
            >
              <CompanyLogo company={company} size="tile" />
            </a>
          ))}
          {overflow > 0 && <span className="earnings-month-more">+{overflow}</span>}
        </div>
      ) : (
        <p className="earnings-month-none">No earnings</p>
      )}
    </article>
  );
}

function MonthBoard({ days, month }) {
  const weeks = useMemo(() => {
    const rows = [];
    for (let index = 0; index < days.length; index += 5) rows.push(days.slice(index, index + 5));
    return rows;
  }, [days]);

  return (
    <div className="earnings-month">
      <div className="earnings-month-head">
        {WEEKDAY_HEADS.map((day) => <span key={day}>{day}</span>)}
      </div>
      {weeks.map((week) => (
        <div className="earnings-month-row" key={week[0].date}>
          {week.map((day) => <MonthCell day={day} inMonth={day.date.slice(0, 7) === month} key={day.date} />)}
        </div>
      ))}
    </div>
  );
}

function CalendarSkeleton({ view }) {
  const count = view === "month" ? 25 : 5;
  return (
    <div className={`earnings-board-loading earnings-board-loading-${view}`} aria-label="Loading earnings calendar">
      {Array.from({ length: count }, (_, day) => (
        <div className="earnings-skeleton-day" key={day}>
          <i />
          {view === "week" && <i />}
          {Array.from({ length: view === "month" ? 3 : 6 }, (__, row) => <span key={row} />)}
        </div>
      ))}
    </div>
  );
}

// `syncUrl` is off when the calendar is a dashboard panel: writing its own
// view into the address bar there would navigate the reader off the dashboard
// they put it on.
export default function EarningsCalendar({ initialView, initialWeek, initialMonth, syncUrl = true }) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [week, setWeek] = useState(initialWeek);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState(null);
  const [moves, setMoves] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const query = view === "month" ? `month=${month}` : `week=${week}`;

  const load = useCallback(async (search, signal) => {
    setLoading(true);
    setError(null);
    // Drop the previous range's moves here rather than in the effect that
    // fetches them: they belong to the week being navigated away from, and
    // leaving them up would print stale numbers under the new week's tiles
    // for as long as the chains take to price.
    setMoves({});
    try {
      const response = await fetch(`/api/earnings-calendar?${search}`, { signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Earnings calendar unavailable.");
      setData(payload);
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || "Earnings calendar unavailable.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => load(query, controller.signal), 0);
    if (syncUrl) router.replace(`/earnings-calendar?view=${view}&${query}`, { scroll: false });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, query, router, syncUrl, view]);

  // Implied moves ride in a second pass rather than inside the calendar
  // response: each one costs an option chain, so folding them into the first
  // request would hold the whole grid behind the slowest ticker. The tiles
  // draw immediately and the moves land underneath them a moment later.
  //
  // Weekly only. The month grid is logos with no room for a number, and
  // pricing ~400 chains for it would be a lot of upstream for nothing shown.
  useEffect(() => {
    if (view !== "week" || !data?.days) return undefined;

    const pairs = data.days.flatMap((day) =>
      day.companies.map((company) => `${company.symbol}:${day.date}`)
    );
    if (!pairs.length) return undefined;

    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/implied-move?symbols=${encodeURIComponent(pairs.join(","))}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        // Replace rather than merge: these are the moves for the week now on
        // screen, and keeping last week's would leave stale numbers under
        // tickers that report in both.
        setMoves(payload.moves || {});
      } catch {
        // A missing implied move is not worth an error state - the calendar
        // is the page, the move is an annotation on it. Tiles keep their
        // blank slot and the grid reads exactly as it did before.
      }
    })();
    return () => controller.abort();
  }, [data, view]);

  const step = (direction) =>
    view === "month"
      ? setMonth((value) => addMonths(value, direction))
      : setWeek((value) => addDays(value, direction * 7));

  // Count every row the grid actually draws. Excluding the time-TBD ones used
  // to be a rounding error; above the $4B floor they are a large share of a
  // quiet week, and the headline read 0 beside five visible tiles.
  const reportCount = useMemo(
    () => data?.days.reduce((total, day) => total + day.companies.length, 0) || 0,
    [data]
  );

  return (
    <main className="earnings-page">
      <header className="earnings-hero">
        <div>
          <span className="earnings-eyebrow">Research tools / Earnings calendar</span>
          <h1>The {view === "month" ? "month" : "week"}’s earnings,<br /><em>before the bell rings.</em></h1>
          <p>Companies worth $4B or more, grouped by the session they report in.</p>
        </div>
        <aside>
          <span>Confirmed reports</span>
          <strong>{loading ? "—" : reportCount}</strong>
          <small>Schedules can change without notice</small>
        </aside>
      </header>

      <nav className="earnings-week-nav" aria-label="Earnings calendar range">
        <button type="button" onClick={() => step(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"}>
          <ArrowIcon direction={-1} /><span>Previous</span>
        </button>
        <div>
          <small>{view === "month" ? "Month of" : "Week of"}</small>
          <strong>{view === "month" ? formatMonth(month) : formatWeek(week)}</strong>
        </div>
        <div className="earnings-view-toggle" role="group" aria-label="Calendar view">
          {["week", "month"].map((option) => (
            <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>
              {option === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => step(1)} aria-label={view === "month" ? "Next month" : "Next week"}>
          <span>Next</span><ArrowIcon />
        </button>
      </nav>

      {error ? (
        <section className="earnings-error" aria-live="polite">
          <strong>Calendar unavailable</strong>
          <span>{error}</span>
          <button type="button" onClick={() => load(query)}>Try again</button>
        </section>
      ) : loading ? (
        <CalendarSkeleton view={view} />
      ) : view === "month" ? (
        <div className="earnings-board-wrap"><MonthBoard days={data.days} month={month} /></div>
      ) : (
        <div className="earnings-board-wrap">
          <div className="earnings-board">
            {data.days.map((day) => <DayColumn day={day} moves={moves} key={day.date} />)}
          </div>
        </div>
      )}

      <footer className="earnings-source">
        <span>Companies above $4B market cap, ranked by size</span>
        <span>Source: {data?.source || "Nasdaq earnings calendar"}</span>
      </footer>
    </main>
  );
}
