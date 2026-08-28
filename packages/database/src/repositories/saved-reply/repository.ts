import { createId } from "@chatbotx.io/utils"
import { and, type DatabaseClient, db, eq } from "../../client"
import { savedReplyModel } from "../../schema"

export type SavedReplyData = {
  shortcut: string
  text: string
}

class SavedReplyRepository {
  async listByWorkspace(
    props: { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.savedReplyModel.findMany({
      where: { workspaceId: props.workspaceId },
      orderBy: { createdAt: "asc" },
    })
  }

  async findById(
    props: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.savedReplyModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
  }

  async create(
    props: { workspaceId: string; data: SavedReplyData },
    tx: DatabaseClient = db,
  ) {
    const [savedReply] = await tx
      .insert(savedReplyModel)
      .values({ id: createId(), workspaceId: props.workspaceId, ...props.data })
      .returning()
    return savedReply
  }

  async update(
    props: { id: string; workspaceId: string; data: SavedReplyData },
    tx: DatabaseClient = db,
  ) {
    const [updated] = await tx
      .update(savedReplyModel)
      .set(props.data)
      .where(
        and(
          eq(savedReplyModel.id, props.id),
          eq(savedReplyModel.workspaceId, props.workspaceId),
        ),
      )
      .returning()
    return updated
  }

  async delete(
    props: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(savedReplyModel)
      .where(
        and(
          eq(savedReplyModel.id, props.id),
          eq(savedReplyModel.workspaceId, props.workspaceId),
        ),
      )
  }
}

export const savedReplyRepository = new SavedReplyRepository()
