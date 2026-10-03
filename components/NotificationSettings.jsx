"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FearGreedAlertButton from "./FearGreedAlertButton";
import RsiLeAlertMenu from "./RsiLeAlertMenu";
import { GEX_SYMBOLS } from "@/lib/gex";
import { RSI_LE_NOTIFICATION_EVENT, RSI_LE_NOTIFICATION_KEYS } from "@/lib/rsiLeNotifications";

export default function NotificationSettings() {
  const [tool, setTool] = useState("sentiment");
  const [enabled, setEnabled] = useState(false);
  const [symbol, setSymbol] = useState("SPY");
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => {
      try {
        setEnabled(localStorage.getItem(RSI_LE_NOTIFICATION_KEYS.enabled) === "1");
        const saved = localStorage.getItem(RSI_LE_NOTIFICATION_KEYS.symbol);
        setSymbol(GEX_SYMBOLS.includes(saved) ? saved : "SPY");
      } catch {}
    };
    sync();
    window.addEventListener(RSI_LE_NOTIFICATION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RSI_LE_NOTIFICATION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function changeSymbol(value) {
    try {
      localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.symbol, value);
      localStorage.removeItem(RSI_LE_NOTIFICATION_KEYS.lastSeen);
      setSymbol(value);
      window.dispatchEvent(new Event(RSI_LE_NOTIFICATION_EVENT));
    } catch { setError("Could not save notification preferences in this browser."); }
  }

  async function toggle() {
    try {
      localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.enabled, enabled ? "0" : "1");
      localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.symbol, symbol);
      setEnabled(!enabled);
      window.dispatchEvent(new Event(RSI_LE_NOTIFICATION_EVENT));
      if (!enabled && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch { setError("Could not update notification preferences."); }
  }

  return (
    <div className="notification-settings">
      <label>Tool
        <select aria-label="Notification tool" value={tool} onChange={event => setTool(event.target.value)}>
          <option value="sentiment">Market sentiment</option>
          <option value="rsi">Live chart: RSI and price</option>
        </select>
      </label>
      {tool === "sentiment" ? <>
        <p>Get email notifications when the sentiment index crosses your chosen level.</p>
        <FearGreedAlertButton embedded />
        <Link href="/alerts">Manage saved market sentiment alerts</Link>
      </> : <>
        <label>Symbol
          <select aria-label="Notification symbol" value={symbol} onChange={event => changeSymbol(event.target.value)}>
            {GEX_SYMBOLS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <p>Choose an RSI signal, percentage move, or price level. These alerts run in this browser while Luna Terminal is open. Rules apply to the selected symbol.</p>
        <RsiLeAlertMenu embedded enabled={enabled} onToggle={toggle} />
        <Link href="/rsi-le">Open Live chart</Link>
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
