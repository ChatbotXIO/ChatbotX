import { createId } from "@chatbotx.io/utils"
import { type DatabaseClient, db } from "../../client"
import { aiEmbeddingModel } from "../../schema"

export const aiEmbeddingRepository = {
  /**
   * Bulk-insert pending embedding chunks, returning the ids of the rows
   * inserted in THIS call via `.returning({ id })`. Preferred over a
   * follow-up `listIdsByFile` read: a separate read-back would pick up rows
   * from a PREVIOUS run of the same file on retry, double-enqueuing their
   * processing jobs — a correctness bug this closes. This is a deliberate
   * behavior change from the pre-refactor worker (which did insert + a
   * separate read-back-by-file query); call it out in the PR body.
   */
  async bulkCreatePending(
    props: {
      aiFileId: string
      workspaceId: string
      chunks: { content: string }[]
    },
    tx: DatabaseClient = db,
  ): Promise<{ id: string }[]> {
    const { aiFileId, workspaceId, chunks } = props
    if (chunks.length === 0) {
      return []
    }
    return await tx
      .insert(aiEmbeddingModel)
      .values(
        chunks.map((c) => ({
          id: createId(),
          content: c.content,
          workspaceId,
          aiFileId,
          status: "pending" as const,
        })),
      )
      .returning({ id: aiEmbeddingModel.id })
  },
}
