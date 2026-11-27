import { describe, expect, test } from "vitest"
import {
  aiFileChunkingConfig,
  estimateAIFileChunkCount,
  resolveAIFileChunkingConfig,
} from "../src/partials"

describe("resolveAIFileChunkingConfig", () => {
  test("null and undefined resolve to today's defaults", () => {
    const defaults = {
      strategy: "auto",
      chunkSize: 1000,
      overlapSize: 200,
      tabularHeaderRow: 1,
    }

    expect(resolveAIFileChunkingConfig(null)).toEqual(defaults)
    expect(resolveAIFileChunkingConfig(undefined)).toEqual(defaults)
  })

  test("keeps explicit values", () => {
    expect(
      resolveAIFileChunkingConfig({
        strategy: "prose",
        chunkSize: 500,
        overlapSize: 50,
        tabularHeaderRow: 3,
      }),
    ).toEqual({
      strategy: "prose",
      chunkSize: 500,
      overlapSize: 50,
      tabularHeaderRow: 3,
    })
  })

  test("clamps overlap to half of the chunk size, including the default", () => {
    expect(
      resolveAIFileChunkingConfig({ chunkSize: 300, overlapSize: 500 })
        .overlapSize,
    ).toBe(150)
    expect(resolveAIFileChunkingConfig({ chunkSize: 200 }).overlapSize).toBe(
      100,
    )
  })

  test("a malformed stored value falls back to the defaults", () => {
    expect(resolveAIFileChunkingConfig({ chunkSize: "huge" }).chunkSize).toBe(
      1000,
    )
    expect(resolveAIFileChunkingConfig("nope").overlapSize).toBe(200)
  })
})

describe("aiFileChunkingConfig", () => {
  test.each([
    [{ chunkSize: 199 }],
    [{ chunkSize: 2001 }],
    [{ overlapSize: 501 }],
    [{ overlapSize: -1 }],
    [{ tabularHeaderRow: 0 }],
    [{ tabularHeaderRow: 21 }],
    [{ strategy: "markdown" }],
    [{ chunkSize: 1000.5 }],
    [{ unknown: 1 }],
  ])("rejects %j", (value) => {
    expect(aiFileChunkingConfig.safeParse(value).success).toBe(false)
  })

  test("accepts the limits and an empty object", () => {
    expect(aiFileChunkingConfig.safeParse({}).success).toBe(true)
    expect(
      aiFileChunkingConfig.safeParse({ chunkSize: 200, overlapSize: 0 })
        .success,
    ).toBe(true)
    expect(
      aiFileChunkingConfig.safeParse({ chunkSize: 2000, tabularHeaderRow: 20 })
        .success,
    ).toBe(true)
  })
})

describe("estimateAIFileChunkCount", () => {
  test("prose slides a window by chunkSize - overlap", () => {
    expect(
      estimateAIFileChunkCount({
        strategy: "prose",
        extractedChars: 2600,
        chunkSize: 1000,
        overlapSize: 200,
      }),
    ).toBe(3)
  })

  test("tabular and markdown ignore overlap", () => {
    expect(
      estimateAIFileChunkCount({
        strategy: "tabular",
        extractedChars: 2600,
        chunkSize: 1000,
        overlapSize: 200,
      }),
    ).toBe(3)
  })

  test("is 0 for no text and at least 1 otherwise", () => {
    expect(
      estimateAIFileChunkCount({
        strategy: "prose",
        extractedChars: 0,
        chunkSize: 1000,
        overlapSize: 0,
      }),
    ).toBe(0)
    expect(
      estimateAIFileChunkCount({
        strategy: "markdown",
        extractedChars: 5,
        chunkSize: 1000,
        overlapSize: 0,
      }),
    ).toBe(1)
  })
})
