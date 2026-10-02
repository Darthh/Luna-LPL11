// Read a JSON response without exploding on one that isn't JSON.
//
// A route that throws before it can reply - a missing table, a dead database -
// comes back as a 500 with an empty body, and `res.json()` on that fails with
// "Unexpected end of JSON input", which tells the reader nothing about what
// went wrong. This returns the parsed body when there is one and the status
// otherwise, so the caller can always show a sentence.
export async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The message to show for a response, or null when it succeeded.
export async function errorFrom(res, fallback = "Something went wrong.") {
  if (res.ok) return null;
  const body = await readJson(res);
  if (body?.error) return body.error;
  if (res.status === 401) return "Sign in required.";
  return `${fallback} (HTTP ${res.status})`;
}
