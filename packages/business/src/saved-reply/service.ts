import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { assertDeletable } from "../template/installed-resource.service"

type SavedReplyModel = typeof savedReplyModel.$inferSelect

class SavedReplyService {
  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: { id: input.id, workspaceId: input.workspaceId },
      message: "Saved reply not found",
    })

    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "savedReply",
      resourceIds: [input.id],
    })

    await db
      .delete(savedReplyModel)
      .where(eq(savedReplyModel.id, savedReply.id))
  }

  async listByWorkspaceId(workspaceId: string): Promise<SavedReplyModel[]> {
    return await db.query.savedReplyModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    })
  }
}

export const savedReplyService = new SavedReplyService()
