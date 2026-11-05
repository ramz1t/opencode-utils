import { describe, expect, test } from "bun:test"
import { chatMessageCount, tokenUsageTotals, totalTokenCount } from "./stats.ts"

describe("session usage stats", () => {
  test("counts user and assistant messages, not session metadata", () => {
    expect(
      chatMessageCount([
        { type: "user" },
        { type: "assistant" },
        { type: "agent-switched" },
        { type: "idle" },
      ]),
    ).toBe(2)
  })

  test("breaks down input, output, reasoning, and cache usage", () => {
    const usage = tokenUsageTotals([
      {
        type: "assistant",
        tokens: { input: 100, output: 25, reasoning: 10, cache: { read: 40, write: 5 } },
      },
      { type: "compaction", tokens: { input: 20, output: 4, cache: { read: 3, write: 1 } } },
      { type: "user" },
    ])

    expect(usage).toEqual({ input: 120, output: 29, reasoning: 10, cacheInput: 43, cacheOutput: 6 })
    expect(totalTokenCount(usage)).toBe(208)
  })

  test("ignores missing, negative, and non-finite token values", () => {
    expect(
      tokenUsageTotals([
        { type: "assistant" },
        { type: "assistant", tokens: { input: Number.NaN, output: -5, cache: { read: 2 } } },
      ]),
    ).toEqual({ input: 0, output: 0, reasoning: 0, cacheInput: 2, cacheOutput: 0 })
  })
})
