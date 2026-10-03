"use client";

import { useEffect, useState } from "react";

const GREETINGS = [
  "See the market in a new light.",
  "Shine a light on your next opportunity.",
  "A little moonlight is all you need.",
  "Markets move, Luna illuminates.",
  "Let curiosity light the way.",
  "Discover a new perspective with Luna.",
  "Your next insight starts here.",
  "Bring your questions. Let Luna light the way.",
];
const STORAGE_KEY = "lunaChatGreeting";

export default function ChatGreeting() {
  // Keep server output and the first client render identical.
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let current = -1;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      const previous = stored === null ? -1 : Number(stored);
      if (Number.isInteger(previous) && previous >= 0 && previous < GREETINGS.length) current = previous;
    } catch {}

    const advance = () => {
      current = (current + 1) % GREETINGS.length;
      setIndex(current);
      try { sessionStorage.setItem(STORAGE_KEY, String(current)); } catch {}
    };
    // Defer the browser-only choice until after hydration.
    const initial = setTimeout(advance, 0);
    let rotation = setInterval(advance, 15000);
    const newChat = () => {
      clearTimeout(initial);
      advance();
      clearInterval(rotation);
      rotation = setInterval(advance, 15000);
    };
    window.addEventListener("luna-new-chat", newChat);
    return () => {
      clearTimeout(initial);
      clearInterval(rotation);
      window.removeEventListener("luna-new-chat", newChat);
    };
  }, []);

  return <span key={index} className="ai-greeting">{GREETINGS[index]}</span>;
}
