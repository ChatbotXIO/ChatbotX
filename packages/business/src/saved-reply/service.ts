import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { assertDeletable } from "../template/installed-resource.service"

type SavedReplyModel = typeof savedReplyModel.$inferSelect

class SavedReplyService {
  async create(input: {
    workspaceId: string
    shortcut: string
    text: string
  }): Promise<SavedReplyModel> {
    const [savedReply] = await db
      .insert(savedReplyModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        shortcut: input.shortcut,
        text: input.text,
      })
      .returning()

    return savedReply
  }

  async findByIdOrFail(props: {
    workspaceId: string
    id: string
  }): Promise<SavedReplyModel> {
    return await findOrFail({
      table: savedReplyModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Saved reply not found",
    })
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: { shortcut: string; text: string },
  ): Promise<SavedReplyModel> {
    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: {
        id: ctx.id,
        workspaceId: ctx.workspaceId,
      },
      message: "Saved reply not found",
    })

    const [updatedSavedReply] = await db
      .update(savedReplyModel)
      .set(data)
      .where(eq(savedReplyModel.id, savedReply.id))
      .returning()

    return updatedSavedReply
  }

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
