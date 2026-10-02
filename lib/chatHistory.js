const KEY = "lunaChatHistory";
export const CHAT_HISTORY_EVENT = "luna-chat-history";

export function readChats() {
  try {
    const chats = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(chats) ? chats.filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages)) : [];
  } catch {
    return [];
  }
}

export function saveChat(chat) {
  try {
    const chats = readChats().filter((entry) => entry.id !== chat.id);
    localStorage.setItem(KEY, JSON.stringify([chat, ...chats].slice(0, 30)));
    window.dispatchEvent(new Event(CHAT_HISTORY_EVENT));
  } catch {
    // Chat still works when browser storage is disabled or full.
  }
}

export function searchChats(chats, query) {
  const terms = String(query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return chats;
  return chats.filter((chat) => {
    const searchable = [chat.title, ...(chat.messages || []).map((message) => message?.content)]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function deleteChat(id) {
  try {
    const chats = readChats().filter((chat) => chat.id !== id);
    localStorage.setItem(KEY, JSON.stringify(chats));
    window.dispatchEvent(new Event(CHAT_HISTORY_EVENT));
    return true;
  } catch {
    return false;
  }
}
