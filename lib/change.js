// How a quote's move is coloured and written. Shared by the ticker tape, the
// screener table, the watchlist rows and the popular-stocks list - four places
// that had the same pair of ternaries pasted into them.
//
// Flat counts as up here: a price that hasn't moved is not a fall, and there is
// no third colour for it in the stylesheet. The hedge fund tables want the
// opposite - an unchanged position is the common case in a book compared
// quarter to quarter, and reads as neither - so lib/hedgeFundFormat.js keeps
// its own three-way version rather than importing this one.
export const changeClass = (v) => ((v ?? 0) >= 0 ? "ticker-change-up" : "ticker-change-down");

// "▲ 1.24%" / "▼ 0.30%" - the arrow carries the sign, so the number doesn't.
export const arrowPct = (v) => `${(v ?? 0) >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(2)}%`;
