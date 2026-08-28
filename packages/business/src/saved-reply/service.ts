import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type SavedReplyData,
  savedReplyRepository,
} from "@chatbotx.io/database/repositories"
import type { SavedReplyModel } from "@chatbotx.io/database/types"
import { notFoundException } from "../errors"
import { assertDeletable } from "../template/installed-resource.service"

class SavedReplyService {
  async list(props: { workspaceId: string }): Promise<SavedReplyModel[]> {
    return await savedReplyRepository.listByWorkspace({
      workspaceId: props.workspaceId,
    })
  }

  async create(props: {
    workspaceId: string
    data: SavedReplyData
    tx?: DatabaseClient
  }): Promise<SavedReplyModel> {
    const { workspaceId, data, tx = db } = props
    return await savedReplyRepository.create({ workspaceId, data }, tx)
  }

  async update(props: {
    workspaceId: string
    id: string
    data: SavedReplyData
    tx?: DatabaseClient
  }): Promise<SavedReplyModel> {
    const { workspaceId, id, data, tx = db } = props

    const updated = await savedReplyRepository.update(
      { id, workspaceId, data },
      tx,
    )
    if (!updated) {
      throw notFoundException("Saved reply not found")
    }

    return updated
  }

  async delete(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, tx = db } = props

    const existing = await savedReplyRepository.findById(
      { id, workspaceId },
      tx,
    )
    if (!existing) {
      throw notFoundException("Saved reply not found")
    }

    await assertDeletable({
      workspaceId,
      resourceKind: "savedReply",
      resourceIds: [id],
    })

    await savedReplyRepository.delete({ id, workspaceId }, tx)
  }
}

export const savedReplyService = new SavedReplyService()
