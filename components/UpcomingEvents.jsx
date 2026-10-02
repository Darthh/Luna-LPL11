"use client";

import { useEffect, useMemo, useState } from "react";
import { upcomingEvents, isToday } from "@/lib/economicEvents";
import { useLanguage } from "./LanguageProvider";

function CalendarIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9.5h18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6.5" y="12" width="3" height="3" rx="0.6" fill="currentColor" />
    </svg>
  );
}

// Event titles carry the instance ("Fed Meeting No. 6 (Day 1)", "GDP Third
// Estimate"); the reporting is about the kind. Stripping the instance means the
// two days of one FOMC meeting, and every month's CPI, share a lookup.

function eventKind(title) {
  return title
    .replace(/\s*No\.\s*\d+/i, "")
    .replace(/\s*\(Day \d+\)/i, "")
    .replace(/^GDP\s+\w+\s+Estimate$/i, "GDP Estimate")
    .trim();
}

export default function UpcomingEvents() {
  const { locale, t } = useLanguage();
  const events = useMemo(() => upcomingEvents(5), []);
  const [articles, setArticles] = useState({});
  // Which pictures failed to load, by kind. A publisher CDN that refuses the
  // request (several reject a no-referrer image fetch, which Safari honours
  // strictly instead of quietly reusing a cached copy) used to take the whole
  // link out of the DOM with .remove() - React never rebuilds a node it did
  // not remove itself, so one flaky picture permanently cost the headline and
  // the source too, which is why the card looked empty on macOS. Keeping it in
  // state drops only the picture and leaves the story readable.
  const [brokenImages, setBrokenImages] = useState({});

  const kinds = useMemo(
    () => [...new Set(events.map((e) => eventKind(e.title)))],
    [events],
  );

  useEffect(() => {
    if (!kinds.length) return;
    const controller = new AbortController();
    fetch(`/api/event-news?kinds=${encodeURIComponent(kinds.join("|"))}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((j) => setArticles(j?.articles ?? {}))
      // The card is the calendar; the stories are a bonus, so a failure here
      // leaves the rows exactly as they were.
      .catch(() => {});
    return () => controller.abort();
  }, [kinds]);

  if (!events.length) return null;

  return (
    <section className="events-card" id="upcoming-events">
      <div className="events-header">
        <h2>{t("Upcoming Events")}</h2>
        <CalendarIcon className="events-header-icon" />
      </div>
      <div className="events-list">
        {events.map((event) => (
          <div className="event-row" key={`${event.date}-${event.title}`}>
            <CalendarIcon className="event-icon" />
            <div className="event-body">
              <div className="event-meta">
                <span className="event-date">{new Date(`${event.date}T00:00:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : locale, { month: "short", day: "2-digit", year: "numeric" })}</span>
                {isToday(event.date) && <span className="event-today">{t("today")}</span>}
              </div>
              <div className="event-title">{event.title}</div>
              <div className="event-desc">{event.description}</div>
              {event.avgMove && (
                <div className="event-move" title="Average absolute SPY move on this type of day, based on real historical closes - not options-implied volatility.">
                  {t("Avg. move:")} <span className="event-move-value">{event.avgMove}</span>
                </div>
              )}
            </div>
            {(() => {
              const kind = eventKind(event.title);
              const article = articles[kind];
              if (!article) return null;
              const showImage = article.image && !brokenImages[kind];
              const source = article.publisher || article.domain;
              return (
                <a
                  className={`event-article${showImage ? "" : " event-article-textonly"}`}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${article.title} (${source})`}
                  aria-label={`${article.title} - ${source}`}
                >
                  {/* The picture carries the source on it; the headline is the
                      link's accessible name rather than a caption, so the row
                      stays short. When the picture will not load the link stays
                      and falls back to the headline, so the story is still
                      reachable rather than disappearing with its thumbnail. */}
                  {showImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      className="event-article-image"
                      src={article.image}
                      alt=""
                      loading="lazy"
                      onError={() => setBrokenImages((prev) => (prev[kind] ? prev : { ...prev, [kind]: true }))}
                    />
                  )}
                  {!showImage && <span className="event-article-headline">{article.title}</span>}
                  <span className="event-article-source">{source}</span>
                </a>
              );
            })()}
          </div>
        ))}
      </div>
    </section>
  );
}
