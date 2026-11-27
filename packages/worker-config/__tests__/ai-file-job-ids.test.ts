import { describe, expect, test } from "vitest"
import {
  buildAIFileEmbeddingJobId,
  buildAIFileReindexJobId,
} from "../src/queues/heavy"

describe("AI file job ids", () => {
  // BullMQ keeps completed/failed jobs and silently skips an add with an id it
  // still holds, so a reindex must never reuse the upload id or an earlier run.
  test("each reindex run gets its own processing job id", () => {
    expect(buildAIFileReindexJobId("10", "run-a")).toBe(
      "heavy-ai-file-10-reindex-run-a",
    )
    expect(buildAIFileReindexJobId("10", "run-a")).not.toBe(
      buildAIFileReindexJobId("10", "run-b"),
    )
  })

  test("embedding ids stay unchanged for jobs without a run", () => {
    expect(
      buildAIFileEmbeddingJobId({ aiFileId: "10", embeddingId: "20" }),
    ).toBe("ai-file-embedding-10-20")
  })

  test("embedding ids carry the run so a reindex re-embeds pending chunks", () => {
    expect(
      buildAIFileEmbeddingJobId({
        aiFileId: "10",
        embeddingId: "20",
        runId: "run-a",
      }),
    ).toBe("ai-file-embedding-10-20-rrun-a")
  })
})
