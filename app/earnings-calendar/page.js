import EarningsCalendar from "@/components/EarningsCalendar";
import { dateIso, mondayOfWeek, monthIso, parseMondayIso, parseMonthIso } from "@/lib/earningsCalendar";

export const metadata = {
  title: "Earnings Calendar",
  description: "See the most anticipated earnings reports for this week and the weeks ahead.",
};

function initialWeek() {
  const today = new Date();
  const monday = mondayOfWeek(today);
  if (today.getUTCDay() === 0 || today.getUTCDay() === 6) monday.setUTCDate(monday.getUTCDate() + 7);
  return dateIso(monday);
}

export default async function EarningsCalendarPage({ searchParams }) {
  const params = await searchParams;
  const week = parseMondayIso(params.week) ? params.week : initialWeek();
  const month = parseMonthIso(params.month) ? params.month : monthIso(new Date());
  const view = params.view === "month" ? "month" : "week";
  return <EarningsCalendar initialView={view} initialWeek={week} initialMonth={month} />;
}
