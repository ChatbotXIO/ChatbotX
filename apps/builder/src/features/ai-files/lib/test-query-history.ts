import type { z } from "zod"
import type { searchAIFilesResponse } from "../schema/public"

type SearchResponse = z.output<typeof searchAIFilesResponse>

/** Metadata of one run: never chunk text, so storing it is harmless. */
export type TestQuerySnapshot = {
  at: string
  verdict: NonNullable<SearchResponse["expected"]>["verdict"] | null
  /** Best rank of a chunk containing the expected answer. */
  answerRank: number | null
  top: Array<{ fileId: string; chunkIndex: number | null; similarity: number }>
}

export type TestQueryComparison =
  | { kind: "answerRank"; from: number | null; to: number | null; at: string }
  | { kind: "topChanged"; changed: number; total: number; at: string }

const TOP_COUNT = 5

export function buildSnapshotKey(fileIds: string[], query: string): string {
  const files = [...fileIds].sort().join(",")
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ")
  return `ai-files:test-query:${files}:${normalized}`
}

export function snapshotFromResult(
  result: SearchResponse,
  at: string,
): TestQuerySnapshot {
  const ranks = (result.expected?.matches ?? [])
    .map((match) => match.rank)
    .filter((rank): rank is number => rank !== null)
  return {
    at,
    verdict: result.expected?.verdict ?? null,
    answerRank: ranks.length > 0 ? Math.min(...ranks) : null,
    top: result.results.slice(0, TOP_COUNT).map((item) => ({
      fileId: item.fileId,
      chunkIndex: item.chunkIndex,
      similarity: item.similarity,
    })),
  }
}

/**
 * Compares by answer rank (when an expected answer was given) or by which
 * chunk positions fill the top 5. Chunk ids change after a reindex, so they
 * are never compared.
 */
export function compareSnapshots(
  previous: TestQuerySnapshot,
  next: TestQuerySnapshot,
): TestQueryComparison | null {
  if (previous.verdict !== null || next.verdict !== null) {
    if (previous.answerRank !== next.answerRank) {
      return {
        kind: "answerRank",
        from: previous.answerRank,
        to: next.answerRank,
        at: previous.at,
      }
    }
    return null
  }
  const before = new Set(
    previous.top.map((item) => `${item.fileId}:${item.chunkIndex}`),
  )
  const changed = next.top.filter(
    (item) => !before.has(`${item.fileId}:${item.chunkIndex}`),
  ).length
  return changed > 0
    ? { kind: "topChanged", changed, total: next.top.length, at: previous.at }
    : null
}

export function readSnapshot(key: string): TestQuerySnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as TestQuerySnapshot) : null
  } catch {
    return null
  }
}

export function writeSnapshot(key: string, snapshot: TestQuerySnapshot): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(snapshot))
  } catch {
    // sessionStorage can be unavailable (private mode, quota): comparison is optional.
  }
}
