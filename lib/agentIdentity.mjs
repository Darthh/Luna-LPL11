import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const COOKIE = "luna-research-owner";
const MAX_AGE = 30 * 24 * 60 * 60;
function secret() {
  if (!process.env.AUTH_SECRET) throw new Error("Research requires AUTH_SECRET.");
  return process.env.AUTH_SECRET;
}
function sign(value) { return createHmac("sha256", secret()).update(value).digest("hex"); }
export function researchIdentity(request, userId) {
  if (userId) return { owner: sign(`user:${userId}`), cookie: null };
  const token = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const [id, expires, signature] = (token || "").split(".");
  const value = `${id}.${expires}`;
  if (/^[a-f0-9-]{36}$/.test(id || "") && Number(expires) > Date.now() && /^[a-f0-9]{64}$/.test(signature || "") &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(sign(value)))) return { owner: sign(`guest:${id}`), cookie: null };
  const nextId = randomUUID();
  const nextValue = `${nextId}.${Date.now() + MAX_AGE * 1000}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { owner: sign(`guest:${nextId}`), cookie: `${COOKIE}=${nextValue}.${sign(nextValue)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure}` };
}
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export function sessionId(owner, conversationId) {
  return createHmac("sha256", secret()).update(`${owner}:${conversationId}`).digest("hex");
}
