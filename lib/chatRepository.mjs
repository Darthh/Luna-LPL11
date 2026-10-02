// Where signed-in users' AI chats are kept. Two stores behind one interface:
//
//   DynamoDB  - when CHAT_TABLE names a table (every AWS stage)
//   memory    - local `next dev` and tests; gone on restart, one process only
//
// Production without CHAT_TABLE gets no store at all, and the routes answer
// 503 so the client keeps chats in the browser instead. A per-instance memory
// store there would look like it works and then lose chats between Lambdas.
//
// Every method takes the session's user id first and scopes every key to it,
// so one user can never name, read or overwrite another user's chat - even if
// two users' browsers happen to generate the same chat id.
//
// Table layout (single table, see docs/BACKEND_PLAN.md section 4.4):
//   chat summary  PK=USER#<user>         SK=CHAT#<chat>
//                 GSI1PK=USER#<user>     GSI1SK=UPD#<updatedAt>#<chat>
//   message       PK=CHAT#<user>#<chat>  SK=MSG#<000123>
import { pool } from "./pool.js";
import { encodeCursor, decodeCursor, searchTextFor, titleFor, matchesQuery, SEARCH_TEXT_CHARS } from "./chats.mjs";

export class ChatGapError extends Error {
  constructor(messageCount) {
    super("Messages are missing before this point; resend from messageCount");
    this.messageCount = messageCount;
  }
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// A search filters summaries in code (DynamoDB has no case-insensitive
// contains), so it reads at most this many before giving up on filling a page.
const SEARCH_SCAN_CAP = 500;

// Strictly increasing per process, so two saves in the same millisecond still
// sort newest-first in a stable order.
let lastNow = 0;
const nowIso = () => new Date((lastNow = Math.max(Date.now(), lastNow + 1))).toISOString();

const clampLimit = (limit) => Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || DEFAULT_LIMIT));

const summaryOf = (row) => ({
  id: row.chatId,
  title: row.title,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  messageCount: row.messageCount,
  pinned: Boolean(row.pinned),
});

// What the summary row should say after `fresh` messages land on `existing`.
function nextSummary(existing, fresh, { title }, now) {
  const added = searchTextFor(fresh);
  return {
    title: title ?? existing?.title ?? titleFor(fresh),
    searchText: [existing?.searchText, added].filter(Boolean).join(" ").slice(0, SEARCH_TEXT_CHARS),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------- memory

export function createMemoryChatRepository() {
  const chats = new Map(); // `${user}\u0000${chat}` -> { summary row, messages[] }
  const keyOf = (userId, chatId) => `${userId}\u0000${chatId}`;

  return {
    kind: "memory",

    async list(userId, { cursor, limit, q } = {}) {
      const offset = decodeCursor(cursor)?.o ?? 0;
      const size = clampLimit(limit);
      const rows = [...chats.values()]
        .map((c) => c.row)
        .filter((row) => row.userId === userId && matchesQuery(row, q))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const page = rows.slice(offset, offset + size);
      return {
        chats: page.map(summaryOf),
        cursor: offset + size < rows.length ? encodeCursor({ o: offset + size }) : null,
      };
    },

    async get(userId, chatId) {
      const chat = chats.get(keyOf(userId, chatId));
      if (!chat) return null;
      return { ...summaryOf(chat.row), messages: chat.messages.map((m) => ({ ...m })) };
    },

    async append(userId, chatId, input) {
      const key = keyOf(userId, chatId);
      const chat = chats.get(key);
      const count = chat?.messages.length ?? 0;
      if (input.from > count) throw new ChatGapError(count);

      const fresh = input.messages.slice(count - input.from);
      if (!fresh.length) {
        if (chat && input.title) chat.row.title = input.title;
        return { messageCount: count, created: false };
      }
      const row = { ...chat?.row, userId, chatId, ...nextSummary(chat?.row, fresh, input, nowIso()) };
      const messages = [...(chat?.messages ?? []), ...fresh.map((m) => ({ ...m }))];
      row.messageCount = messages.length;
      chats.set(key, { row, messages });
      return { messageCount: messages.length, created: !chat };
    },

    async update(userId, chatId, { title, pinned }) {
      const chat = chats.get(keyOf(userId, chatId));
      if (!chat) return false;
      if (title !== undefined) chat.row.title = title;
      if (pinned !== undefined) chat.row.pinned = pinned;
      return true;
    },

    async remove(userId, chatId) {
      return chats.delete(keyOf(userId, chatId));
    },
  };
}

// ---------------------------------------------------------------- DynamoDB

const pad = (n) => String(n).padStart(6, "0");
const summaryKey = (userId, chatId) => ({ PK: `USER#${userId}`, SK: `CHAT#${chatId}` });
const messagePk = (userId, chatId) => `CHAT#${userId}#${chatId}`;
const isConditionFailure = (error) => error?.name === "ConditionalCheckFailedException";

export async function createDynamoChatRepository({ tableName, client } = {}) {
  const lib = await import("@aws-sdk/lib-dynamodb");
  const { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchWriteCommand } = lib;
  let doc = client;
  if (!doc) {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    doc = lib.DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  const TableName = tableName;

  async function readSummary(userId, chatId) {
    const out = await doc.send(new GetCommand({ TableName, Key: summaryKey(userId, chatId), ConsistentRead: true }));
    return out.Item ?? null;
  }

  async function queryAll(params) {
    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await doc.send(new QueryCommand({ ...params, ExclusiveStartKey }));
      items.push(...(out.Items ?? []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  return {
    kind: "dynamodb",

    async list(userId, { cursor, limit, q } = {}) {
      const size = clampLimit(limit);
      const searching = Boolean(String(q ?? "").trim());
      const rows = [];
      let ExclusiveStartKey = decodeCursor(cursor);
      let scanned = 0;
      do {
        const out = await doc.send(
          new QueryCommand({
            TableName,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: { ":pk": `USER#${userId}` },
            ScanIndexForward: false,
            Limit: searching ? MAX_LIMIT : size - rows.length,
            ExclusiveStartKey,
          })
        );
        const items = out.Items ?? [];
        ExclusiveStartKey = out.LastEvaluatedKey;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          scanned += 1;
          if (matchesQuery(item, q)) rows.push(item);
          // A full page mid-way through what was read: resume right after the
          // last row sent, not after rows that were read but not returned.
          if (rows.length === size) {
            const more = i < items.length - 1 || out.LastEvaluatedKey;
            ExclusiveStartKey = more ? { PK: item.PK, SK: item.SK, GSI1PK: item.GSI1PK, GSI1SK: item.GSI1SK } : undefined;
            break;
          }
        }
      } while (rows.length < size && ExclusiveStartKey && scanned < SEARCH_SCAN_CAP);
      return { chats: rows.map(summaryOf), cursor: encodeCursor(ExclusiveStartKey ?? null) };
    },

    async get(userId, chatId) {
      const row = await readSummary(userId, chatId);
      if (!row) return null;
      const items = await queryAll({
        TableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :msg)",
        ExpressionAttributeValues: { ":pk": messagePk(userId, chatId), ":msg": "MSG#" },
      });
      // Messages are written before the summary counts them, so a write in
      // progress can leave extras past messageCount; they aren't saved yet.
      const messages = items
        .filter((item) => item.index < row.messageCount)
        .map(({ role, content, sources, stockCard, model }) => ({ role, content, sources, stockCard, model }));
      return { ...summaryOf(row), messages };
    },

    async append(userId, chatId, input) {
      const existing = await readSummary(userId, chatId);
      const count = existing?.messageCount ?? 0;
      if (input.from > count) throw new ChatGapError(count);

      const fresh = input.messages.slice(count - input.from);
      if (!fresh.length) {
        if (existing && input.title) await this.update(userId, chatId, { title: input.title });
        return { messageCount: count, created: false };
      }

      // 1. Messages first, each claiming its own index. A retry, or another
      // tab that got there first, makes the put fail its condition - the
      // index is already saved, which is all this step needs to know.
      const pk = messagePk(userId, chatId);
      await pool(fresh, 8, async (message, i) => {
        const index = count + i;
        try {
          await doc.send(
            new PutCommand({
              TableName,
              Item: { PK: pk, SK: `MSG#${pad(index)}`, index, ...message },
              ConditionExpression: "attribute_not_exists(PK)",
            })
          );
        } catch (error) {
          if (!isConditionFailure(error)) throw error;
        }
      });

      // 2. Then the summary moves forward to cover them. It only ever grows:
      // if another request already counted further, this one has nothing to
      // add and its failed condition is not an error.
      const messageCount = count + fresh.length;
      const now = nowIso();
      const next = nextSummary(existing, fresh, input, now);
      try {
        await doc.send(
          new UpdateCommand({
            TableName,
            Key: summaryKey(userId, chatId),
            UpdateExpression:
              "SET userId = :user, chatId = :chat, title = :title, searchText = :search, messageCount = :count, " +
              "updatedAt = :now, createdAt = if_not_exists(createdAt, :now), GSI1PK = :gpk, GSI1SK = :gsk",
            ConditionExpression: "attribute_not_exists(messageCount) OR messageCount < :count",
            ExpressionAttributeValues: {
              ":user": userId,
              ":chat": chatId,
              ":title": next.title,
              ":search": next.searchText,
              ":count": messageCount,
              ":now": now,
              ":gpk": `USER#${userId}`,
              ":gsk": `UPD#${now}#${chatId}`,
            },
          })
        );
      } catch (error) {
        if (!isConditionFailure(error)) throw error;
      }
      return { messageCount, created: !existing };
    },

    async update(userId, chatId, { title, pinned }) {
      const sets = [];
      const values = {};
      if (title !== undefined) (sets.push("title = :title"), (values[":title"] = title));
      if (pinned !== undefined) (sets.push("pinned = :pinned"), (values[":pinned"] = pinned));
      if (!sets.length) return Boolean(await readSummary(userId, chatId));
      try {
        await doc.send(
          new UpdateCommand({
            TableName,
            Key: summaryKey(userId, chatId),
            UpdateExpression: `SET ${sets.join(", ")}`,
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeValues: values,
          })
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) return false;
        throw error;
      }
    },

    async remove(userId, chatId) {
      const out = await doc.send(
        new DeleteCommand({ TableName, Key: summaryKey(userId, chatId), ReturnValues: "ALL_OLD" })
      );
      // The summary goes first so the chat disappears from the list at once;
      // its messages are unreachable from then on and are cleaned up here.
      const keys = await queryAll({
        TableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": messagePk(userId, chatId) },
        ProjectionExpression: "PK, SK",
      });
      for (let i = 0; i < keys.length; i += 25) {
        let RequestItems = { [TableName]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) };
        for (let attempt = 0; attempt < 5 && RequestItems?.[TableName]?.length; attempt++) {
          const res = await doc.send(new BatchWriteCommand({ RequestItems }));
          RequestItems = res.UnprocessedItems;
        }
      }
      return Boolean(out.Attributes);
    },
  };
}

// ---------------------------------------------------------------- factory

let current;

export async function getChatRepository() {
  if (current !== undefined) return current;
  if (process.env.CHAT_TABLE) {
    current = await createDynamoChatRepository({ tableName: process.env.CHAT_TABLE });
  } else if (process.env.NODE_ENV !== "production" || process.env.CHAT_STORE === "memory") {
    // Survive `next dev` hot reloads, which re-evaluate this module.
    current = globalThis.__lunaChatRepository ??= createMemoryChatRepository();
  } else {
    current = null;
  }
  return current;
}
