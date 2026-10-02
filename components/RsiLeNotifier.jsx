"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rsiLeSignals } from "@/lib/rsiLe";
import {
  playRsiLeAlertSound,
  RSI_LE_NOTIFICATION_CHANNEL,
  RSI_LE_NOTIFICATION_EVENT,
  RSI_LE_NOTIFICATION_KEYS,
  describeRsiLeRule,
  readRsiLeRules,
  rsiLeRuleFires,
} from "@/lib/rsiLeNotifications";
import { GEX_POLL_MS, pollGexHistory } from "@/lib/gexHistory";
import { GEX_SYMBOLS } from "@/lib/gex";

const CHECK_INTERVAL_MS = 30_000;
const TOAST_DURATION_MS = 9_000;

function readPreference(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function signalPayload(point, signal, symbol) {
  return {
    id: `${point.t}:${signal}:${Date.now()}`,
    signal,
    symbol,
    price: point.o ?? point.c,
    timestamp: point.t,
    title: `${signal === 2 ? "RsiLE +2" : "RsiSE −2"} signal triggered`,
  };
}

// A price rule fires on the level, not on a bar, so its id carries the rule so
// the same rule does not re-alert on every 30s poll while price sits past it.
function rulePayload(rule, point, symbol) {
  return {
    id: `${rule.id}:${point.t}`,
    signal: rule.direction === "above" ? 2 : -2,
    symbol,
    price: point.c,
    timestamp: point.t,
    title: describeRsiLeRule(rule).replace("Notify when", "Alert:"),
  };
}

export default function RsiLeNotifier() {
  const [enabled, setEnabled] = useState(false);
  const [symbol, setSymbol] = useState("SPY");
  const [toast, setToast] = useState(null);
  const channelRef = useRef(null);
  const lastDeliveredRef = useRef(null);
  const dismissTimerRef = useRef(null);

  const deliver = useCallback((payload, allowNative = false) => {
    if (!payload || payload.id === lastDeliveredRef.current) return;
    lastDeliveredRef.current = payload.id;
    const activeTab = document.visibilityState === "visible" && document.hasFocus();
    if (activeTab) {
      setToast(payload);
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
      playRsiLeAlertSound();
    } else if (allowNative && "Notification" in window && Notification.permission === "granted") {
      new Notification(payload.title || `${payload.signal === 2 ? "RsiLE +2" : "RsiSE −2"} signal`, {
        body: `${payload.symbol} at $${payload.price.toFixed(2)}`,
        tag: `rsi-le-${payload.timestamp}-${payload.signal}`,
      });
      playRsiLeAlertSound();
    }
  }, []);

  useEffect(() => {
    const syncPreferences = () => {
      setEnabled(readPreference(RSI_LE_NOTIFICATION_KEYS.enabled) === "1");
      const saved = readPreference(RSI_LE_NOTIFICATION_KEYS.symbol, "SPY");
      setSymbol(GEX_SYMBOLS.includes(saved) ? saved : "SPY");
    };
    syncPreferences();
    window.addEventListener("storage", syncPreferences);
    window.addEventListener(RSI_LE_NOTIFICATION_EVENT, syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener(RSI_LE_NOTIFICATION_EVENT, syncPreferences);
    };
  }, []);

  useEffect(() => {
    const receive = (payload) => deliver(payload, false);
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(RSI_LE_NOTIFICATION_CHANNEL);
      channelRef.current = channel;
      channel.addEventListener("message", (event) => receive(event.data));
    }
    const onStorage = (event) => {
      if (event.key !== RSI_LE_NOTIFICATION_KEYS.event || !event.newValue) return;
      try { receive(JSON.parse(event.newValue)); } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
      window.removeEventListener("storage", onStorage);
      clearTimeout(dismissTimerRef.current);
    };
  }, [deliver]);

  useEffect(() => {
    if (!enabled) return;
    let controller = null;
    let checking = false;

    const checkForSignal = async () => {
      if (checking) return;
      checking = true;
      controller = new AbortController();
      try {
        const response = await fetch(`/api/stock-chart?symbol=${symbol}&range=1d`, { signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json.points?.length) return;
        const points = json.points;
        const closes = points.map((point) => point.c);
        const fullCloses = [...(json.warmup || []), ...closes];
        const fullSignals = rsiLeSignals(fullCloses);
        const signals = fullSignals.slice(-points.length);
        const lastSeen = Number(readPreference(RSI_LE_NOTIFICATION_KEYS.lastSeen, "0"));
        if (!lastSeen) {
          localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.lastSeen, String(points[points.length - 1].t));
          return;
        }
        let signalIndex = -1;
        for (let index = signals.length - 1; index >= 0; index--) {
          if (signals[index] && points[index].t > lastSeen) {
            signalIndex = index;
            break;
          }
        }
        const rules = readRsiLeRules();
        // Price rules are level-based: they are checked against the newest bar
        // every poll, independently of whether a +/-2 signal printed.
        const last = points[points.length - 1];
        const basis = json.prevClose ?? points[0]?.o ?? points[0]?.c;
        for (const rule of rules) {
          if (rule.kind === "signal") continue;
          if (!rsiLeRuleFires(rule, last.c, basis)) continue;
          const payload = rulePayload(rule, last, symbol);
          if (payload.id === lastDeliveredRef.current) continue;
          channelRef.current?.postMessage(payload);
          deliver(payload, true);
        }

        if (signalIndex < 0) return;
        // No +/-2 rule on the list means no signal alert. lastSeen is left
        // where it is, so adding the rule later can still surface a bar that
        // printed while it was off.
        if (!rules.some((rule) => rule.kind === "signal")) return;

        const payload = signalPayload(points[signalIndex], signals[signalIndex], symbol);
        // Claim the signal before publishing it so parallel tabs do not each
        // produce a separate alert after the same network response.
        const latestSeen = Number(readPreference(RSI_LE_NOTIFICATION_KEYS.lastSeen, "0"));
        if (points[signalIndex].t <= latestSeen) return;
        localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.lastSeen, String(points[signalIndex].t));
        localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.event, JSON.stringify(payload));
        channelRef.current?.postMessage(payload);
        deliver(payload, true);
      } catch (error) {
        if (error.name !== "AbortError") console.warn("RsiLE notification check failed");
      } finally {
        checking = false;
      }
    };

    checkForSignal();
    const timer = setInterval(checkForSignal, CHECK_INTERVAL_MS);
    return () => {
      controller?.abort();
      clearInterval(timer);
    };
  }, [deliver, enabled, symbol]);

  // GEX runs site-wide, not just on RsiLE: the snapshot series has to be
  // complete whenever the chart mounts, so it is polled from the chrome that
  // every route renders and is independent of the alert toggle.
  useEffect(() => {
    let stopped = false;
    const poll = () => { if (!stopped) pollGexHistory(); };
    poll();
    const timer = setInterval(poll, GEX_POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!toast) return null;
  const isEntry = toast.signal === 2;
  const time = new Date(toast.timestamp * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <aside className={`rle-alert-toast ${isEntry ? "entry" : "exit"}`} role="alert" aria-live="assertive">
      <div className="rle-alert-icon" aria-hidden="true">{isEntry ? "↑" : "↓"}</div>
      <div className="rle-alert-copy">
        <strong>{toast.title || `${isEntry ? "RsiLE +2" : "RsiSE −2"} signal triggered`}</strong>
        <span>{toast.symbol} · fill ${toast.price.toFixed(2)} · {time}</span>
      </div>
      <button type="button" onClick={() => setToast(null)} aria-label="Dismiss RsiLE notification">×</button>
    </aside>
  );
}
