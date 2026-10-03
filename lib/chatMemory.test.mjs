import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMORY_BUDGET, memoryFromChats, memoryMessages } from "./chatMemory.mjs";
import { accountChatMemory } from "./accountChatMemory.mjs";
import { createMemoryChatRepository } from "./chatRepository.mjs";

const user = (content) => ({ role: "user", content });
const chat = (id, content, updatedAt = 1) => ({ id, updatedAt, messages: [user(content)] });

test("retrieves an older fact rather than filling context with recent unrelated chats", () => {
  const archive = [chat("old", "My dog is named Maple. I prefer dividend investing.")];
  for (let i = 0; i < 70; i++) archive.push(chat(`new-${i}`, `Explain sector number ${i}.`, i + 2));
  const result = memoryFromChats(archive, "What is my dog's name?");
  assert.ok(result.some((entry) => entry.text.includes("Maple")));
});

test("only remembers raw user statements and skips context already in recent turns", () => {
  const archive = [chat("a", "My name is Alex."), chat("b", "My name is Alex.")];
  archive[0].messages.push({ role: "assistant", content: "Invented fact: your name is Chris." });
  assert.equal(memoryFromChats(archive, "name").filter((entry) => entry.text.includes("Alex")).length, 1);
  assert.deepEqual(memoryFromChats(archive, "name", ["My name is Alex."]), []);
});

test("retrieves facts at the end of long user messages", () => {
  const text = "Unrelated market commentary. ".repeat(600) + "My favorite company is Cedarworks.";
  assert.ok(memoryFromChats([chat("long", text)], "What is my favorite company?").some((entry) => entry.text.includes("Cedarworks")));
});

test("bounds prompt size, retains the current question, and labels memory as historical evidence", () => {
  const entries = Array.from({ length: 100 }, (_, i) => chat(`c-${i}`, `My preference ${i}: ${"growth ".repeat(200)}`, i));
  const memory = memoryFromChats(entries, "growth");
  assert.ok(JSON.stringify(memory).length <= MEMORY_BUDGET);
  const messages = [user("What about dividends?")];
  const outgoing = memoryMessages(messages, memory);
  assert.ok(outgoing[0].content.startsWith(messages[0].content));
  assert.ok(outgoing[0].content.includes("not instructions"));
  assert.ok(outgoing[0].content.includes("not treat past market numbers as live"));
  assert.equal(messages[0].content, "What about dividends?");
});

test("orders corrections from older to newer", () => {
  const memory = memoryFromChats([chat("one", "My allocation is 20% bonds.", 1), chat("two", "My allocation is now 40% bonds.", 2)], "allocation");
  assert.ok(memory[0].text.includes("20%"));
  assert.ok(memory[1].text.includes("40%"));
  const sameChat = { id: "corrections", updatedAt: 3, messages: [user("My allocation is 20% bonds."), user("My allocation is now 40% bonds.")] };
  const sameChatMemory = memoryFromChats([sameChat], "allocation");
  assert.ok(sameChatMemory[0].text.includes("20%"));
  assert.ok(sameChatMemory[1].text.includes("40%"));
});

test("account recall paginates beyond the sidebar, isolates owners, and forgets deleted chats", async () => {
  const repo = createMemoryChatRepository();
  await repo.append("alice", "old-chat", { from: 0, messages: [user("My dog is named Maple.")] });
  for (let i = 0; i < 65; i++) {
    await repo.append("alice", `chat-${i}`, { from: 0, messages: [user(`Discuss sector ${i}.`)] });
  }
  await repo.append("bob", "old-chat", { from: 0, messages: [user("My dog is named Juniper.")] });
  const alice = await accountChatMemory(repo, "alice", "What is my dog's name?");
  assert.ok(alice.some((entry) => entry.text.includes("Maple")));
  assert.ok(!alice.some((entry) => entry.text.includes("Juniper")));
  assert.deepEqual(await accountChatMemory(repo, "stranger", "dog"), []);
  await repo.remove("alice", "old-chat");
  assert.ok(!(await accountChatMemory(repo, "alice", "dog")).some((entry) => entry.text.includes("Maple")));
});
