"use client";

import EarningsCalendar from "./EarningsCalendar";
import { dateIso, mondayOfWeek, monthIso } from "@/lib/earningsCalendar";

// The calendar as a dashboard panel. Its page hands it the week and month off
// the query string; on the dashboard there is no query string to read, so the
// same defaults that page falls back to are computed here instead - and the URL
// sync is off, because a panel that rewrites the address bar navigates the
// reader away from the dashboard they put it on.
export default function EarningsCalendarPanel() {
  const today = new Date();
  const monday = mondayOfWeek(today);
  // A Saturday or Sunday reader is looking at next week's prints, not the ones
  // that already happened - same rule the page uses.
  const weekend = today.getUTCDay() === 0 || today.getUTCDay() === 6;
  if (weekend) monday.setUTCDate(monday.getUTCDate() + 7);

  return (
    <EarningsCalendar
      initialView="week"
      initialWeek={dateIso(monday)}
      initialMonth={monthIso(today)}
      syncUrl={false}
    />
  );
}
