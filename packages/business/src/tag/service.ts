import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
} from "@chatbotx.io/database/client"
import { contactModel, contactsToTagsModel } from "@chatbotx.io/database/schema"
import type { TagModel } from "@chatbotx.io/database/types"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { withCache } from "@chatbotx.io/redis"
import { isNumericId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

class TagService extends BaseService {
  protected readonly cachePrefix: string = "tags"

  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<TagModel[]> {
    const { tx = db, contactId } = props
    const key = `contacts:${contactId}:tags`

    return await withCache(
      key,
      async () =>
        await tx.query.tagModel.findMany({
          where: { contactsToTags: { contactId } },
          orderBy: { name: "asc" },
        }),
      {
        tags: [`contacts:${contactId}`],
      },
    )
  }

  async findByKey(props: {
    workspaceId: string
    key: string
    folderId?: string | null
    tx?: DatabaseClient
  }): Promise<TagModel | undefined> {
    const { workspaceId, key, folderId, tx = db } = props
    return await withCache(
      `tags:${workspaceId}:key:${key}`,
      async () => {
        const folderWhere =
          folderId === null ? { isNull: true as const } : folderId

        if (isNumericId(key)) {
          const byId = await tx.query.tagModel.findFirst({
            where: { id: key, workspaceId, folderId: folderWhere },
          })
          if (byId) {
            return byId
          }
        }

        return await tx.query.tagModel.findFirst({
          where: { name: key, workspaceId, folderId: folderWhere },
        })
      },
      {
        dynamicTags: (result) =>
          result
            ? [
                "tags",
                `tags:${workspaceId}`,
                `tags:${workspaceId}:${result.id}`,
              ]
            : undefined,
      },
    )
  }

  async findByKeyOrFail(props: {
    workspaceId: string
    key: string
    folderId?: string | null
    tx?: DatabaseClient
  }): Promise<TagModel> {
    const tag = await this.findByKey(props)
    if (!tag) {
      throw notFoundException("Tag not found")
    }
    return tag
  }

  async attachToContact(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, tx = db } = props

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
    })

    const tags = await tx.query.tagModel.findMany({
      where: { workspaceId, id: { in: tagIds } },
      columns: { id: true },
    })

    if (tags.length === 0) {
      return
    }

    await tx
      .insert(contactsToTagsModel)
      .values(tags.map((tag) => ({ contactId, tagId: tag.id })))
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })

    for (const tag of tags) {
      emitTagApplied(workspaceId, contactId, tag.id) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
  }

  async detachFromContact(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, tx = db } = props

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
    })

    await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.contactId, contactId),
          inArray(contactsToTagsModel.tagId, tagIds),
        ),
      )

    for (const tagId of tagIds) {
      emitTagRemoved(workspaceId, contactId, tagId) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
  }
}

export const tagService = new TagService()
