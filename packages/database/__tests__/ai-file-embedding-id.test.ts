import { describe, expect, test } from "vitest"
import { createAIFileEmbeddingId } from "../src/repositories/ai-file-embedding/embedding-id"

const POSITIVE_BIGINT = /^[1-9]\d*$/

describe("createAIFileEmbeddingId", () => {
  // Changing this value re-embeds every file: update it deliberately, never
  // here by accident.
  test("keeps the id of a known chunk stable", () => {
    expect(
      createAIFileEmbeddingId({
        aiFileId: "123",
        chunkIndex: 4,
        content: "Giá gói Pro: 499.000",
      }),
    ).toBe("322835431141440608")
  })

  test("depends on file, position and content", () => {
    const base = { aiFileId: "1", chunkIndex: 0, content: "a" }
    const id = createAIFileEmbeddingId(base)

    expect(createAIFileEmbeddingId({ ...base, aiFileId: "2" })).not.toBe(id)
    expect(createAIFileEmbeddingId({ ...base, chunkIndex: 1 })).not.toBe(id)
    expect(createAIFileEmbeddingId({ ...base, content: "b" })).not.toBe(id)
    expect(createAIFileEmbeddingId({ ...base })).toBe(id)
  })

  test("is a positive bigint string", () => {
    expect(
      createAIFileEmbeddingId({ aiFileId: "1", chunkIndex: 0, content: "" }),
    ).toMatch(POSITIVE_BIGINT)
  })
})
