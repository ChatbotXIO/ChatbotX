import { createHash } from "node:crypto"

/**
 * Kept out of the `repositories` barrel on purpose: `node:crypto` is not
 * available in the Edge bundles (proxy, instrumentation) that import the
 * barrel, so callers use `@chatbotx.io/database/repositories/ai-file-embedding-id`.
 *
 * Deterministic chunk id: the same file, position and text always hash to the
 * same id, so a reprocess keeps already-embedded chunks. The key order inside
 * `JSON.stringify` is part of the id — changing it re-embeds every file.
 */
export function createAIFileEmbeddingId(input: {
  aiFileId: string
  chunkIndex: number
  content: string
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        aiFileId: input.aiFileId,
        chunkIndex: input.chunkIndex,
        content: input.content,
      }),
    )
    .digest("hex")
  const id = BigInt(`0x${digest.slice(0, 15)}`)
  return id === 0n ? "1" : id.toString()
}
