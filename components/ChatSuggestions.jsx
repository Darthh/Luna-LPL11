"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHAT_SUGGESTIONS, nextSuggestions } from "@/lib/chatSuggestions.mjs";

export default function ChatSuggestions({ onChoose }) {
  const [selected, setSelected] = useState([0, 1, 2]);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let swap;
    const timer = setInterval(() => {
      setFading(true);
      swap = setTimeout(() => {
        setSelected(previous => nextSuggestions(previous));
        setFading(false);
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1500);
    }, 15000);
    return () => { clearInterval(timer); clearTimeout(swap); };
  }, []);

  return (
    <div className="ai-suggestions">
      <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" /></svg> Suggested</span>
      <div className={`ai-suggestion-batch${fading ? " is-fading" : ""}`}>
        {selected.map(index => {
          const item = CHAT_SUGGESTIONS[index];
          return (
            <div className="ai-suggestion-row" key={index}>
              <button type="button" onClick={() => onChoose(item.prompt)} title={item.prompt}>
                <strong>{item.title}</strong><small>{item.description}</small>
              </button>
              <Link href={item.path} aria-label={`Open tool for ${item.title}`} title="Open related tool">↗</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
