// Release dates sourced from the White House OMB's official "Schedule of
// Release Dates for Principal Federal Economic Indicators" for 2026
// (whitehouse.gov/wp-content/uploads/2025/09/pfei_schedule_release_dates_cy2026.pdf)
// and the Federal Reserve's published FOMC meeting calendar
// (federalreserve.gov/monetarypolicy/fomccalendars.htm). Day-of-month
// arrays are indexed Jan(0)..Dec(11) for 2026.

const YEAR = 2026;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// CPI and the Employment Situation report data for the *previous* month.
const CPI_RELEASE_DAYS = [13, 11, 11, 10, 12, 10, 14, 12, 11, 14, 10, 10];
const EMPLOYMENT_RELEASE_DAYS = [9, 6, 6, 3, 8, 5, 2, 7, 4, 2, 6, 4];

// [month, day1, day2] - all 8 regularly scheduled FOMC meetings.
const FOMC_MEETINGS = [
  [1, 27, 28],
  [3, 17, 18],
  [4, 28, 29],
  [6, 16, 17],
  [7, 28, 29],
  [9, 15, 16],
  [10, 27, 28],
  [12, 8, 9],
];

// [month, day, quarterLabel, estimateLabel]
const GDP_RELEASES = [
  [1, 29, "Q4 2025", "Advance"],
  [2, 26, "Q4 2025", "Second"],
  [3, 27, "Q4 2025", "Third"],
  [4, 30, "Q1 2026", "Advance"],
  [5, 28, "Q1 2026", "Second"],
  [6, 25, "Q1 2026", "Third"],
  [7, 30, "Q2 2026", "Advance"],
  [8, 26, "Q2 2026", "Second"],
  [9, 30, "Q2 2026", "Third"],
  [10, 29, "Q3 2026", "Advance"],
  [11, 25, "Q3 2026", "Second"],
  [12, 23, "Q3 2026", "Third"],
];

// Average absolute SPY daily move on each event type, computed directly
// from real SPY closes (this app's own /api/prices data, ~18 months,
// 2025-01-01 through the most recent available close) matched against the
// real release dates for each category over the same window (sourced the
// same way as the events above - OMB's 2025/2026 schedules and the Fed's
// 2024/2025/2026 FOMC calendars). This is a realized historical average,
// not an options-market "implied" move - this app has no options data
// feed, so that figure can't be shown honestly. Re-run periodically as
// more history accumulates; see the project chat history for the exact
// date lists and computation used.
const AVG_MOVE = {
  cpi: 0.008, // n=18, Jan 2025 - Jun 2026
  employment: 0.012, // n=18 (one date excluded: no trading that day)
  gdpAdvance: 0.005, // n=6
  gdpSecond: 0.007, // n=6
  gdpThird: 0.007, // n=6
  fomcDay1: 0.006, // n=20, no policy decision announced this day
  fomcDay2: 0.007, // n=20, decision + press conference day
};

function formatMove(fraction) {
  return `±${(fraction * 100).toFixed(1)}%`;
}

function isoDate(month, day) {
  return `${YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Data-covered-month label for CPI/Employment releases, which report on
// the month before they're published (Dec 2025 wraps back from Jan 2026).
function previousMonthLabel(month) {
  const idx = month - 2;
  return idx < 0 ? `${MONTH_NAMES[11]} ${YEAR - 1}` : `${MONTH_NAMES[idx]} ${YEAR}`;
}

function buildEvents() {
  const events = [];

  CPI_RELEASE_DAYS.forEach((day, i) => {
    events.push({
      date: isoDate(i + 1, day),
      title: "CPI (Inflation) Report",
      description: `08:30 AM Eastern Time. Report for ${previousMonthLabel(i + 1)}.`,
      avgMove: formatMove(AVG_MOVE.cpi),
    });
  });

  EMPLOYMENT_RELEASE_DAYS.forEach((day, i) => {
    events.push({
      date: isoDate(i + 1, day),
      title: "Monthly Employment Report",
      description: `08:30 AM Eastern Time. Report for ${previousMonthLabel(i + 1)}.`,
      avgMove: formatMove(AVG_MOVE.employment),
    });
  });

  GDP_RELEASES.forEach(([month, day, quarter, estimate]) => {
    const moveKey = estimate === "Advance" ? "gdpAdvance" : estimate === "Second" ? "gdpSecond" : "gdpThird";
    events.push({
      date: isoDate(month, day),
      title: `GDP ${estimate} Estimate`,
      description: `08:30 AM Eastern Time. Estimate for ${quarter}.`,
      avgMove: formatMove(AVG_MOVE[moveKey]),
    });
  });

  FOMC_MEETINGS.forEach(([month, day1, day2], i) => {
    const meetingNo = i + 1;
    const fomcDesc =
      "The Federal Open Market Committee (FOMC) holds eight regularly scheduled meetings during the year and other meetings as needed.";
    events.push({
      date: isoDate(month, day1),
      title: `Fed Meeting No. ${meetingNo} (Day 1)`,
      description: fomcDesc,
      avgMove: formatMove(AVG_MOVE.fomcDay1),
    });
    events.push({
      date: isoDate(month, day2),
      title: `Fed Meeting No. ${meetingNo} (Day 2)`,
      description: fomcDesc,
      avgMove: formatMove(AVG_MOVE.fomcDay2),
    });
  });

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

const ALL_EVENTS = buildEvents();

// Returns up to `limit` events from `fromDate` (inclusive) onward, in
// chronological order. `fromDate` defaults to today.
export function upcomingEvents(limit = 8, fromDate = new Date()) {
  const todayIso = fromDate.toISOString().slice(0, 10);
  return ALL_EVENTS.filter((e) => e.date >= todayIso).slice(0, limit);
}

export function isToday(dateIso, fromDate = new Date()) {
  return dateIso === fromDate.toISOString().slice(0, 10);
}
