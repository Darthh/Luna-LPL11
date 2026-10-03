import { memoryCandidates, selectMemory } from "./chatMemory.mjs";
import { pool } from "./pool.js";

// Read the account archive, not the browser's 30-chat sidebar or the model's
// recent-turn window. Pagination keeps even old conversations reachable.
export async function accountChatMemory(repo, userId, question, excluded = []) {
  let cursor;
  let candidates = [];
  do {
    const page = await repo.list(userId, { limit: 50, cursor });
    const memories = await pool(page.chats, 4, async (summary) => {
      const chat = await repo.get(userId, summary.id);
      return selectMemory(memoryCandidates([chat], excluded), question);
    });
    const fresh = memories.flat();
    // Keep at most one page plus the best earlier candidates in memory.
    candidates = selectMemory([...candidates, ...fresh], question);
    cursor = page.cursor;
  } while (cursor);
  return selectMemory(candidates, question);
}
