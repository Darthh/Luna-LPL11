"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./AIWorkspace.css";
import { researchMessages } from "@/lib/chatResearch.mjs";
import LunaAILogo from "@/components/LunaAILogo";
import ChatSuggestions from "@/components/ChatSuggestions";
import { ollamaModels, ollamaChat } from "@/lib/ollamaClient.mjs";
import { readChats, saveChat } from "@/lib/chatHistory";
import { STOCK_RANGES, buildStockCard, chartGeometry, stockLookupForMessage } from "@/lib/chatStockCard.mjs";
import { HOSTED_MODELS } from "@/lib/hostedModels.mjs";

const LOCAL_KEY = "lunaLocalModel";
const LOCAL_SECRET_KEY = "lunaLocalModelKey";
const INLINE = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*/g;

function Rich({ text }) {
  return text.split(/\n{2,}/).map((paragraph, index) => {
    const parts = [];
    let last = 0;
    for (const match of paragraph.matchAll(INLINE)) {
      if (match.index > last) parts.push(paragraph.slice(last, match.index));
      if (match[1] && match[2].startsWith("/") && !match[2].includes("{")) {
        parts.push(<Link key={parts.length} href={match[2]}>{match[1]}</Link>);
      } else if (match[1] && /^https?:\/\//i.test(match[2])) {
        parts.push(<a key={parts.length} href={match[2]} target="_blank" rel="noopener noreferrer">{match[1]}</a>);
      } else if (match[1]) {
        parts.push(match[1]);
      } else {
        parts.push(<strong key={parts.length}>{match[3]}</strong>);
      }
      last = match.index + match[0].length;
    }
    parts.push(paragraph.slice(last));
    return <p key={index}>{parts}</p>;
  });
}

function StockQuoteCard({ card }) {
  const initialRange = STOCK_RANGES.some((range) => range.key === card.range) ? card.range : "1d";
  const [activeRange, setActiveRange] = useState(initialRange);
  const [series, setSeries] = useState({ [initialRange]: card.points });
  const [loadingRange, setLoadingRange] = useState(null);
  const requestId = useRef(0);
  const points = series[activeRange] || card.points;
  const geometry = chartGeometry(points, 620, 150, 5);
  if (!geometry) return null;

  const positive = (card.changePct ?? 0) >= 0;
  const currency = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: card.currency || "USD",
    maximumFractionDigits: 2,
  });
  const compactCurrency = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: card.currency || "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const compactNumber = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const accent = geometry.rising ? "var(--ai-stock-up)" : "var(--ai-stock-down)";

  async function selectRange(nextRange) {
    setActiveRange(nextRange);
    if (series[nextRange]) return;
    const currentRequest = ++requestId.current;
    setLoadingRange(nextRange);
    try {
      const response = await fetch(`/api/stock-chart?symbol=${encodeURIComponent(card.symbol)}&range=${nextRange}`);
      if (!response.ok) return;
      const chart = await response.json();
      if (currentRequest !== requestId.current || !Array.isArray(chart.points) || chart.points.length < 2) return;
      setSeries((current) => ({ ...current, [nextRange]: chart.points }));
    } finally {
      if (currentRequest === requestId.current) setLoadingRange(null);
    }
  }

  return (
    <section className="ai-stock-card" aria-label={`${card.symbol} interactive stock chart`}>
      <div className="ai-stock-card-head">
        <div>
          <Link href={`/stock/${encodeURIComponent(card.symbol)}`} className="ai-stock-name">
            {card.name} <span>{card.symbol}</span>
          </Link>
          <strong className="ai-stock-price">{currency.format(card.price)}</strong>
          {Number.isFinite(card.changePct) && (
            <span className={`ai-stock-change ${positive ? "positive" : "negative"}`}>
              {positive ? "+" : ""}{Number(card.change ?? 0).toFixed(2)} ({positive ? "+" : ""}{card.changePct.toFixed(2)}%)
            </span>
          )}
        </div>
      </div>

      <div className="ai-stock-ranges" role="group" aria-label="Chart range">
        {STOCK_RANGES.map((range) => (
          <button
            key={range.key}
            type="button"
            className={activeRange === range.key ? "is-active" : ""}
            aria-pressed={activeRange === range.key}
            onClick={() => selectRange(range.key)}
          >
            {range.label}
          </button>
        ))}
      </div>

      <svg className={`ai-stock-chart${loadingRange === activeRange ? " is-loading" : ""}`} viewBox="0 0 620 150" role="img" aria-label={`${card.symbol} ${activeRange} price movement`} preserveAspectRatio="none">
        <line x1="5" y1="75" x2="615" y2="75" className="ai-stock-gridline" />
        <polygon points={geometry.area} fill={accent} opacity="0.12" />
        <polyline points={geometry.line} fill="none" stroke={accent} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
      </svg>

      <dl className="ai-stock-stats">
        <div><dt>Open</dt><dd>{Number.isFinite(card.open) ? currency.format(card.open) : "—"}</dd></div>
        <div><dt>Day range</dt><dd>{Number.isFinite(card.dayLow) && Number.isFinite(card.dayHigh) ? `${currency.format(card.dayLow)} – ${currency.format(card.dayHigh)}` : "—"}</dd></div>
        <div><dt>Volume</dt><dd>{Number.isFinite(card.volume) ? compactNumber.format(card.volume) : "—"}</dd></div>
        <div><dt>Market cap</dt><dd>{Number.isFinite(card.marketCap) ? compactCurrency.format(card.marketCap) : "—"}</dd></div>
        <div><dt>Trailing P/E</dt><dd>{Number.isFinite(card.trailingPE) ? card.trailingPE.toFixed(2) : "—"}</dd></div>
        <div><dt>Forward P/E</dt><dd>{Number.isFinite(card.forwardPE) ? card.forwardPE.toFixed(2) : "—"}</dd></div>
        <div><dt>Profit margin</dt><dd>{Number.isFinite(card.profitMargin) ? `${(card.profitMargin * 100).toFixed(1)}%` : "—"}</dd></div>
      </dl>
    </section>
  );
}

function localChatUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The local endpoint must use http or https.");
  }
  const base = url.toString().replace(/\/$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

async function readHostedResponse(response, onText) {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `The hosted model is unavailable (${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const event = JSON.parse(raw);
      if (event.t === "text") {
        answer += event.v;
        onText(answer);
      } else if (event.t === "error") {
        throw new Error(event.v);
      }
    }
  }
  return answer;
}

async function readLocalResponse(response, onText) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body.slice(0, 240) || `Local model returned ${response.status}.`);
  }
  if (!response.body) throw new Error("The local model returned no response.");

  // Some OpenAI-compatible servers ignore `stream: true` and return one JSON
  // document. Supporting both shapes keeps LM Studio and smaller llama.cpp
  // builds from looking disconnected when they are not.
  if (response.headers.get("content-type")?.includes("application/json")) {
    const event = await response.json();
    const answer = event.choices?.[0]?.message?.content ?? "";
    if (answer) onText(answer);
    return answer;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const raw = line.replace(/^data:\s*/, "").trim();
      if (!raw || raw === "[DONE]") continue;
      const event = JSON.parse(raw);
      const delta = event.choices?.[0]?.delta?.content ?? event.choices?.[0]?.message?.content ?? "";
      if (delta) {
        answer += delta;
        onText(answer);
      }
    }
  }
  const tail = buffer.replace(/^data:\s*/, "").trim();
  if (tail && tail !== "[DONE]") {
    const event = JSON.parse(tail);
    const delta = event.choices?.[0]?.delta?.content ?? event.choices?.[0]?.message?.content ?? "";
    if (delta) {
      answer += delta;
      onText(answer);
    }
  }
  return answer;
}

export default function AIWorkspace({ chatId = null }) {
  const [webSearch, setWebSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const modelWindow = useRef(null);
  const modelTrigger = useRef(null);
  const [mode, setMode] = useState("hosted");
  const [installedModels, setInstalledModels] = useState([]);
  const [ollamaModel, setOllamaModel] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [hostedModel, setHostedModel] = useState(HOSTED_MODELS[0].id);
  const [local, setLocal] = useState({ endpoint: "http://localhost:11434/v1", model: "qwen3.8:27b", key: "", remember: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef(null);
  const activeChatId = useRef(chatId);

  useEffect(() => {
    activeChatId.current = chatId;
    const chat = chatId ? readChats().find((entry) => entry.id === chatId) : null;
    // Browser storage is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(chat?.messages || []);
    setInput("");
    setError("");
  }, [chatId]);

  useEffect(() => {
    const reset = () => {
      activeChatId.current = null;
      setMessages([]);
      setInput("");
      setError("");
    };
    window.addEventListener("luna-new-chat", reset);
    return () => window.removeEventListener("luna-new-chat", reset);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      const key = sessionStorage.getItem(LOCAL_SECRET_KEY) || "";
      // Browser storage does not exist during the server render; mirror it
      // once after hydration, as DashboardProvider does for the panel layout.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setLocal((current) => ({ ...current, ...saved, key }));
    } catch {}
  }, []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!settingsOpen) return;
    function close(event) {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && (modelWindow.current?.contains(event.target) || modelTrigger.current?.contains(event.target))) return;
      setSettingsOpen(false);
      if (event.type === "keydown") modelTrigger.current?.focus();
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [settingsOpen]);

  function saveLocal(next) {
    setLocal(next);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ endpoint: next.endpoint, model: next.model, remember: next.remember }));
      if (next.remember && next.key) sessionStorage.setItem(LOCAL_SECRET_KEY, next.key);
      else sessionStorage.removeItem(LOCAL_SECRET_KEY);
    } catch {}
  }

  async function refreshOllama() {
    setRefreshing(true);
    setModelStatus("Connecting to Ollama…");
    try {
      const names = await ollamaModels();
      setInstalledModels(names);
      setOllamaModel(current => names.includes(current) ? current : names[0] || "");
      setModelStatus(names.length ? "Connected to Ollama. Enable Web search to research online." : "No chat models installed. Run ollama pull llama3.2, then refresh models.");
    } catch (reason) {
      setInstalledModels([]);
      setOllamaModel("");
      setModelStatus(reason.message);
    } finally {
      setRefreshing(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    if (next === "ollama") refreshOllama();
  }

  async function send(value) {
    const question = value.trim();
    if (!question || busy) return;
    const lookup = stockLookupForMessage(question);
    const stockCardPromise = lookup
      ? (async () => {
          let symbol = lookup.symbol;
          if (!symbol) {
            const searchResponse = await fetch(`/api/stock-search?q=${encodeURIComponent(lookup.query)}`);
            if (!searchResponse.ok) return null;
            symbol = (await searchResponse.json()).results?.[0]?.symbol;
          }
          if (!symbol) return null;
          const [profileResponse, chartResponse] = await Promise.all([
            fetch(`/api/stock-profile?symbol=${encodeURIComponent(symbol)}`),
            fetch(`/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=1d`),
          ]);
          if (!profileResponse.ok || !chartResponse.ok) return null;
          return buildStockCard(await profileResponse.json(), await chartResponse.json());
        })().catch(() => null)
      : Promise.resolve(null);
    const history = [...messages.filter((message) => !message.error), { role: "user", content: question }];
    const conversationId = activeChatId.current || crypto.randomUUID();
    activeChatId.current = conversationId;
    setInput("");
    setError("");
    setBusy(true);
    setSettingsOpen(false);
    setMessages([...history, { role: "assistant", content: "" }]);
    let sources = [];
    const update = (content) => setMessages((current) => [
      ...current.slice(0, -1),
      { ...current.at(-1), role: "assistant", content, sources, model: activeLabel },
    ]);

    stockCardPromise.then((stockCard) => {
      if (!stockCard) return;
      setMessages((current) => [
        ...current.slice(0, -1),
        { ...current.at(-1), stockCard },
      ]);
    });

    try {
      let answer;
      let outgoing = history.map(({ role, content }) => ({ role, content }));
      if (webSearch) {
        setSearching(true);
        const response = await fetch("/api/ai-research", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: question }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Web search failed.");
        sources = result.sources;
        outgoing = researchMessages(outgoing, sources, result.retrievedAt);
        setSearching(false);
        update("");
      }
      if (mode === "hosted") {
        const response = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: outgoing, model: hostedModel, webResearch: webSearch }),
        });
        answer = await readHostedResponse(response, update);
      } else if (mode === "ollama") {
        answer = await ollamaChat({ model: ollamaModel, messages: outgoing }, update);
      } else {
        if (!local.model.trim()) throw new Error("Enter the model name exposed by your local server.");
        const response = await fetch(localChatUrl(local.endpoint), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(local.key ? { Authorization: `Bearer ${local.key}` } : {}),
          },
          body: JSON.stringify({ model: local.model.trim(), messages: outgoing, stream: true }),
        });
        answer = await readLocalResponse(response, update);
      }
      if (!answer?.trim()) throw new Error("The model returned an empty answer.");
      const stockCard = await stockCardPromise;
      const assistantMessage = { role: "assistant", content: answer, sources, model: activeLabel, ...(stockCard ? { stockCard } : {}) };
      setMessages([...history, assistantMessage]);
      saveChat({
        id: conversationId,
        title: history.find((message) => message.role === "user")?.content.slice(0, 60) || "Chat",
        messages: [...history, assistantMessage],
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: message, error: true }]);
    } finally {
      setSearching(false);
      setBusy(false);
    }
  }

  const activeLabel = mode === "hosted"
    ? HOSTED_MODELS.find((model) => model.id === hostedModel)?.label
    : mode === "ollama" ? ollamaModel || "Ollama" : local.model || "Local model";

  return (
    <section className="ai-workspace" aria-label="Luna AI workspace">
      <div className={`ai-stage${messages.length ? " has-chat" : ""}`}>
        <header className="ai-welcome">
          <span className="ai-mark" aria-hidden="true"><LunaAILogo /></span>
          <div>
            <h2>{messages.length ? activeLabel : "What are we looking into?"}</h2>
          </div>
        </header>

        {messages.length > 0 && (
          <div className="ai-transcript" ref={scroller} aria-live="polite">
            {messages.map((message, index) => (
              <article key={index} className={`ai-message ai-message-${message.role}${message.error ? " is-error" : ""}`}>
                {message.role === "assistant" && <div className="ai-answer-label"><LunaAILogo /><strong>{message.model || activeLabel}</strong></div>}
                {message.stockCard && <StockQuoteCard card={message.stockCard} />}
                {message.content ? <Rich text={message.content} /> : <span className="ai-thinking">{searching ? "Searching the web" : "Thinking"}</span>}
                {message.sources?.length > 0 && <div className="ai-sources" aria-label="Web sources"><span>Sources</span>{message.sources.map((source, i) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{i + 1}. {source.title}</a>)}</div>}
              </article>
            ))}
          </div>
        )}

        <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); send(input); }}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            placeholder={messages.length ? "Send a Message" : "How can I help you today?"}
            aria-label="Message Luna"
            rows={1}
            maxLength={8000}
          />
          <div className="ai-composer-tools">
            <button type="button" className="ai-tool-button ai-web-toggle" disabled={busy} onClick={() => setWebSearch((on) => !on)} aria-pressed={webSearch} title="Search the web before answering. Your question is sent to Luna's search service.">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>
              Web search
            </button>
            <button ref={modelTrigger} type="button" className="ai-tool-button ai-model-trigger" disabled={busy} onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-controls="ai-model-window" aria-haspopup="dialog">
              <span>{activeLabel}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
            </button>
            <button type="submit" className="ai-send-button" disabled={busy || !input.trim()} aria-label="Send message">↑</button>
          </div>

        {settingsOpen && (
          <div ref={modelWindow} id="ai-model-window" className="ai-settings" role="dialog" aria-label="Choose a model">
            <div className="ai-mode-switch" role="group" aria-label="AI connection">
              <button type="button" disabled={busy} aria-pressed={mode === "hosted"} className={mode === "hosted" ? "is-active" : ""} onClick={() => switchMode("hosted")}>AI model</button>
              <button type="button" disabled={busy} aria-pressed={mode !== "hosted"} className={mode !== "hosted" ? "is-active" : ""} onClick={() => switchMode("ollama")}>Local hosted</button>
            </div>
            <div className="ai-settings-head">
              <div>
                <strong>{mode === "hosted" ? "AI model" : "Local hosted model"}</strong>
                <p>{mode === "hosted" ? "Uses Luna's configured AI provider and live market tools." : mode === "ollama" ? "Uses Ollama on this computer. No API key or Luna account required; chat is sent directly to Ollama." : "Your endpoint and key stay in this browser and are sent only to the endpoint below."}</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close connection settings">×</button>
            </div>
            {mode !== "hosted" && (
              <div className="ai-mode-switch" role="group" aria-label="Local connection type">
                <button type="button" className={mode === "ollama" ? "is-active" : ""} onClick={() => switchMode("ollama")}>Ollama</button>
                <button type="button" className={mode === "local" ? "is-active" : ""} onClick={() => switchMode("local")}>Custom endpoint</button>
              </div>
            )}
            {mode === "hosted" ? (
              <div className="ai-model-grid">
                {HOSTED_MODELS.map((model) => (
                  <button key={model.id} type="button" className={hostedModel === model.id ? "is-selected" : ""} onClick={() => { setHostedModel(model.id); setSettingsOpen(false); }}>
                    <strong>{model.label}</strong><span>{model.detail}</span>
                  </button>
                ))}
              </div>
            ) : mode === "ollama" ? (
              <div className="ai-ollama-settings">
                <label className="ai-model-select">Installed model
                  <select value={ollamaModel} disabled={refreshing} onChange={event => { setOllamaModel(event.target.value); setSettingsOpen(false); }}>
                    <option value="">Choose an installed model</option>
                    {installedModels.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <button type="button" className="ai-tool-button" disabled={busy || refreshing} onClick={refreshOllama}>{refreshing ? "Connecting…" : "Refresh models"}</button>
                <p className="ai-local-note" role="status">{modelStatus}</p>
                <p className="ai-local-note">Start Ollama, select an installed model, and send a message. To install a model, run <code>ollama pull llama3.2</code>.</p>
              </div>
            ) : (
              <div className="ai-local-fields">
                <label>Endpoint<input value={local.endpoint} onChange={(event) => saveLocal({ ...local, endpoint: event.target.value })} placeholder="http://localhost:11434/v1" /></label>
                <label>Model<input value={local.model} onChange={(event) => saveLocal({ ...local, model: event.target.value })} placeholder="qwen3.8:27b" /></label>
                <label>API key <span>(optional)</span><input type="password" value={local.key} onChange={(event) => saveLocal({ ...local, key: event.target.value })} autoComplete="off" placeholder="Not required by Ollama" /></label>
                <label className="ai-remember"><input type="checkbox" checked={local.remember} onChange={(event) => saveLocal({ ...local, remember: event.target.checked })} /> Keep key for this browser session</label>
                <p className="ai-local-note">Supports Ollama, LM Studio, llama.cpp, and other OpenAI-compatible <code>/chat/completions</code> servers. Your server must allow this site’s browser origin.</p>
              </div>
            )}
          </div>
        )}

        </form>

        {!messages.length && (
          <ChatSuggestions onChoose={prompt => {
            setInput(prompt);
            document.querySelector('.ai-composer textarea')?.focus();
          }} />
        )}
        {error && <p className="ai-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
