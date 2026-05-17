import {
  and,
  arrayContains,
  type DatabaseClient,
  db,
  eq,
  inArray,
  or,
} from "@chatbotx.io/database/client"
import {
  type FolderType,
  folderTypes,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import {
  automatedResponseModel,
  customFieldModel,
  flowModel,
  folderModel,
  sequenceModel,
  tagModel,
  triggerModel,
  webhookModel,
} from "@chatbotx.io/database/schema"
import type { FolderModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"

type ListFoldersInput = {
  workspaceId: string
  folderType: FolderType
  parentId?: string | null
  isTrash?: boolean | null
}

class FolderService extends BaseService {
  async list(input: ListFoldersInput): Promise<FolderModel[]> {
    const { workspaceId, folderType, parentId, isTrash } = input
    let resolvedParentId: string | { isNull: true } | undefined
    if (parentId != null) {
      resolvedParentId =
        parentId === rootFolderId ? { isNull: true as const } : parentId
    }

    return await db.query.folderModel.findMany({
      where: {
        workspaceId,
        folderType,
        isTrash: isTrash ?? undefined,
        parentId: resolvedParentId,
      },
      orderBy: { createdAt: "asc" },
    })
  }

  async getWithParents(props: {
    id: string
    workspaceId: string
  }): Promise<{ folder: FolderModel | null; parents: FolderModel[] }> {
    const { id, workspaceId } = props
    const folder = await db.query.folderModel.findFirst({
      where: { id, workspaceId },
    })
    if (!folder) {
      return { folder: null, parents: [] }
    }
    if (folder.paths.length === 0) {
      return { folder, parents: [] }
    }

    const tempParents = await db.query.folderModel.findMany({
      where: { id: { in: folder.paths } },
    })

    const pathOrder = new Map(folder.paths.map((pid, i) => [pid.toString(), i]))
    const parents = tempParents
      .filter((p) => pathOrder.has(p.id.toString()))
      .sort(
        (a, b) =>
          (pathOrder.get(a.id.toString()) ?? 0) -
          (pathOrder.get(b.id.toString()) ?? 0),
      )

    return { folder, parents }
  }

  async find(props: {
    id: string
    workspaceId: string
    folderType?: FolderType
    tx?: DatabaseClient
  }): Promise<FolderModel | undefined> {
    const { id, workspaceId, folderType, tx = db } = props
    return await tx.query.folderModel.findFirst({
      where: folderType ? { id, workspaceId, folderType } : { id, workspaceId },
    })
  }

  async findOrFail(props: {
    id: string
    workspaceId: string
    folderType?: FolderType
    tx?: DatabaseClient
  }): Promise<FolderModel> {
    const folder = await this.find(props)
    if (!folder) {
      throw notFoundException("Folder not found")
    }
    return folder
  }

  async ensureExists(props: {
    id: string
    workspaceId: string
    folderType: FolderType
    tx?: DatabaseClient
  }): Promise<void> {
    await this.findOrFail(props)
  }

  async create(props: {
    workspaceId: string
    data: { name: string; parentId: string | null; folderType: FolderType }
    tx?: DatabaseClient
  }): Promise<FolderModel> {
    const { workspaceId, data, tx = db } = props
    let paths: string[] = []

    if (data.parentId) {
      const parentFolder = await tx.query.folderModel.findFirst({
        where: { id: data.parentId },
      })
      if (!parentFolder) {
        throw new ChatbotXException("Parent folder does not exist!")
      }
      paths = [...parentFolder.paths, parentFolder.id]
    }

    const [folder] = await tx
      .insert(folderModel)
      .values({ ...data, id: createId(), workspaceId, paths })
      .returning()

    return folder
  }

  async update(props: {
    workspaceId: string
    id: string
    data: { name?: string }
    tx?: DatabaseClient
  }): Promise<FolderModel> {
    const { workspaceId, id, data, tx = db } = props
    await this.findOrFail({ id, workspaceId, tx })

    const [updated] = await tx
      .update(folderModel)
      .set(data)
      .where(eq(folderModel.id, id))
      .returning()

    return updated
  }

  async bulkDelete(props: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    const { workspaceId, ids } = props
    await db.transaction(async (tx) => {
      for (const id of ids) {
        const folder = await this.find({ id, workspaceId, tx })
        if (!folder) {
          continue
        }

        await tx
          .delete(folderModel)
          .where(
            and(
              eq(folderModel.workspaceId, workspaceId),
              or(
                eq(folderModel.id, id),
                arrayContains(folderModel.paths, [id]),
              ),
            ),
          )
      }
    })
  }

  async changeFolder(props: {
    workspaceId: string
    folderType: FolderType
    modelIds: string[]
    newFolderId: string
  }): Promise<void> {
    const { workspaceId, folderType, modelIds, newFolderId } = props
    const resourceModel = this.resolveResourceModel(folderType)

    const resources = await db
      .select({ id: resourceModel.id })
      .from(resourceModel)
      .where(
        and(
          eq(resourceModel.workspaceId, workspaceId),
          inArray(resourceModel.id, modelIds),
        ),
      )

    if (!resources || resources.length === 0) {
      throw new ChatbotXException("Resource not found")
    }

    const resolvedFolderId =
      !newFolderId || newFolderId === rootFolderId ? null : newFolderId

    if (resolvedFolderId) {
      await this.findOrFail({ id: resolvedFolderId, workspaceId, folderType })
    }

    await db
      .update(resourceModel)
      .set({ folderId: resolvedFolderId })
      .where(
        and(
          eq(resourceModel.workspaceId, workspaceId),
          inArray(resourceModel.id, modelIds),
        ),
      )
  }

  private resolveResourceModel(folderType: FolderType) {
    switch (folderType) {
      case folderTypes.enum.tag:
        return tagModel
      case folderTypes.enum.flow:
        return flowModel
      case folderTypes.enum.customField:
        return customFieldModel
      case folderTypes.enum.automatedResponse:
        return automatedResponseModel
      case folderTypes.enum.sequence:
        return sequenceModel
      case folderTypes.enum.trigger:
        return triggerModel
      case folderTypes.enum.webhook:
        return webhookModel
      default:
        throw new ChatbotXException("Invalid folder type")
    }
  }
}

export const folderService = new FolderService()
