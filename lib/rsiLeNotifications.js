export const RSI_LE_NOTIFICATION_KEYS = {
  enabled: "rsi-le-notifications-enabled",
  symbol: "rsi-le-notifications-symbol",
  lastSeen: "rsi-le-notifications-last-seen",
  event: "rsi-le-notification-event",
};

export const RSI_LE_NOTIFICATION_EVENT = "rsi-le-notifications-change";
export const RSI_LE_NOTIFICATION_CHANNEL = "rsi-le-signal-alerts-v1";

export function playRsiLeAlertSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(1080, now + 0.18);
    oscillator.frequency.setValueAtTime(880, now + 0.25);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.56);
    oscillator.addEventListener("ended", () => context.close());
  } catch {}
}

// Alert rules live under one key as a JSON array so a tab can read the whole
// set in a single localStorage hit and the notifier can evaluate them in a
// loop instead of growing a branch per alert type.
export const RSI_LE_RULES_KEY = "rsi-le-notification-rules";
export const RSI_LE_MAX_RULES = 5;

// A rule is { id, kind, direction, value }. "signal" is the original +/-2
// trigger and carries no value; the other two compare live price against one.
export const RSI_LE_RULE_KINDS = {
  signal: { label: "+/−2 signal triggered", unit: null },
  percent: { label: "Price moves", unit: "%" },
  price: { label: "Price reaches", unit: "$" },
};

export function readRsiLeRules() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RSI_LE_RULES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, RSI_LE_MAX_RULES) : [];
  } catch {
    return [];
  }
}

export function writeRsiLeRules(rules) {
  try {
    localStorage.setItem(RSI_LE_RULES_KEY, JSON.stringify(rules.slice(0, RSI_LE_MAX_RULES)));
  } catch {}
  window.dispatchEvent(new Event(RSI_LE_NOTIFICATION_EVENT));
}

// Returns the human sentence for a rule, used by both the list and the toast.
export function describeRsiLeRule(rule) {
  if (rule.kind === "signal") return "Notify when +/−2 triggered";
  const arrow = rule.direction === "above" ? "rises above" : "falls below";
  if (rule.kind === "percent") return `Notify when price ${arrow} ${rule.value}%`;
  return `Notify when price ${arrow} $${rule.value}`;
}

// Evaluates one price rule. `basis` is the session's opening price, which is
// what a percent move is measured from.
export function rsiLeRuleFires(rule, price, basis) {
  if (!Number.isFinite(price) || !Number.isFinite(rule.value)) return false;
  if (rule.kind === "price") {
    return rule.direction === "above" ? price >= rule.value : price <= rule.value;
  }
  if (rule.kind === "percent") {
    if (!Number.isFinite(basis) || !basis) return false;
    const move = ((price - basis) / basis) * 100;
    return rule.direction === "above" ? move >= rule.value : move <= -Math.abs(rule.value);
  }
  return false;
}
