import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchSeries } from "./yields.js";

test("yield gaps and zero readings never become chart observations", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response([
    "observation_date,DGS10",
    "2026-01-01,4.25",
    "2026-01-02,",
    "2026-01-03,   ",
    "2026-01-04,.",
    "2026-01-05,0.00",
    "2026-01-06,-0.25",
    "2026-01-07,invalid",
    "2026-01-08,4.30",
  ].join("\r\n"));
  try {
    assert.deepEqual(await fetchSeries("DGS10"), [
      { date: "2026-01-01", value: 4.25 },
      { date: "2026-01-06", value: -0.25 },
      { date: "2026-01-08", value: 4.3 },
    ]);
    globalThis.fetch = async () => new Response("observation_date,DGS10\n2026-01-01,\n2026-01-02,0\n");
    await assert.rejects(fetchSeries("DGS10"), /No observations/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
