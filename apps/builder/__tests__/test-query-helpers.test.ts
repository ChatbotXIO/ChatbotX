import { describe, expect, test } from "vitest"
import { splitByExpected } from "../src/features/ai-files/lib/expected-highlight"
import {
  buildSnapshotKey,
  compareSnapshots,
  snapshotFromResult,
  type TestQuerySnapshot,
} from "../src/features/ai-files/lib/test-query-history"

describe("splitByExpected", () => {
  test("marks every case-insensitive occurrence", () => {
    expect(
      splitByExpected("Pro 499.000 and again 499.000!", "499.000"),
    ).toEqual([
      { text: "Pro ", match: false },
      { text: "499.000", match: true },
      { text: " and again ", match: false },
      { text: "499.000", match: true },
      { text: "!", match: false },
    ])
    expect(splitByExpected("PRICE", "price")).toEqual([
      { text: "PRICE", match: true },
    ])
  })

  test("accents matter, like the server search", () => {
    expect(splitByExpected("giá", "gia")).toEqual([
      { text: "giá", match: false },
    ])
  })

  test("returns plain text without an expected answer", () => {
    expect(splitByExpected("hello", undefined)).toEqual([
      { text: "hello", match: false },
    ])
    expect(splitByExpected("hello", "  ")).toEqual([
      { text: "hello", match: false },
    ])
  })
})

describe("test query history", () => {
  const result = (
    ranks: (number | null)[],
    verdict: "inTopResults" | "foundButLowRank" | "notInAnyChunk" | null,
    top: [string, number | null][] = [],
  ) =>
    snapshotFromResult(
      {
        mode: "files",
        appliedConfig: null,
        files: [],
        diagnosis: "ok",
        timingsMs: { embed: 0, search: 0 },
        results: top.map(([fileId, chunkIndex], index) => ({
          chunkId: String(index),
          fileId,
          fileName: fileId,
          chunkIndex,
          content: "",
          similarity: 0.9 - index / 10,
          rank: index + 1,
          passedThreshold: true,
          usedByAgent: null,
          agentVisible: true,
        })),
        expected: verdict
          ? {
              verdict,
              matches: ranks.map((rank, index) => ({
                fileId: "1",
                fileName: "a",
                chunkId: String(index),
                chunkIndex: index,
                rank,
              })),
            }
          : null,
      },
      "2026-10-26T10:00:00.000Z",
    )

  test("the key ignores file order, case and extra spaces", () => {
    expect(buildSnapshotKey(["2", "1"], "  Giá  Pro ")).toBe(
      buildSnapshotKey(["1", "2"], "giá pro"),
    )
    expect(buildSnapshotKey(["1"], "a")).not.toBe(buildSnapshotKey(["2"], "a"))
  })

  test("keeps the best rank of a chunk holding the answer", () => {
    expect(result([null, 8, 3], "inTopResults").answerRank).toBe(3)
    expect(result([null], "foundButLowRank").answerRank).toBeNull()
  })

  test("reports a changed answer rank", () => {
    const previous = result([8], "foundButLowRank")
    const next = result([2], "inTopResults")

    expect(compareSnapshots(previous, next)).toMatchObject({
      kind: "answerRank",
      from: 8,
      to: 2,
    })
    expect(compareSnapshots(next, next)).toBeNull()
  })

  test("without an expected answer, compares chunk positions and not ids", () => {
    const previous: TestQuerySnapshot = result([], null, [
      ["1", 0],
      ["1", 1],
      ["1", 2],
    ])
    const next = result([], null, [
      ["1", 0],
      ["1", 1],
      ["1", 9],
    ])

    expect(compareSnapshots(previous, next)).toMatchObject({
      kind: "topChanged",
      changed: 1,
      total: 3,
    })
    expect(compareSnapshots(previous, previous)).toBeNull()
  })
})
