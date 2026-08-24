import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { assertDeletable } from "../template/installed-resource.service"

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
}

export const savedReplyService = new SavedReplyService()
