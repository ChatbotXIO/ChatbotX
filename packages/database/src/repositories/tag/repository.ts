import { createId, isNumericId } from "@chatbotx.io/utils"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  notExists,
  notInArray,
  relationsFilterToSQL,
  sql,
} from "../../client"
import { rootFolderId } from "../../partials"
import {
  contactInboxModel,
  contactsToTagsModel,
  contactToTagChannelModel,
  tagModel,
} from "../../schema"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "../../utils"

export type ListTagsParams = {
  workspaceId: string
  name?: string | null
  folderId?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

export type ListTagsRow = typeof tagModel.$inferSelect & {
  contactsCount: number
}

export type ListTagsResult = { data: ListTagsRow[]; pageCount: number }

export type TagContactPair = { contactId: string; tagId: string }

const toFolderIdFilter = (folderId?: string | null) =>
  folderId === null ? { isNull: true as const } : folderId

class TagRepository {
  async list(
    params: ListTagsParams,
    tx: DatabaseClient = db,
  ): Promise<ListTagsResult> {
    const where = {
      workspaceId: params.workspaceId,
      deletedAt: { isNull: true as const },
      name: params.name ? { ilike: likeContains(params.name) } : undefined,
      folderId: params.folderId
        ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
          params.folderId === rootFolderId
          ? { isNull: true as const }
          : params.folderId
        : undefined,
    }

    const pagination = parsePagination(params)
    const orderBy = parseOrderByAsObject(tagModel, params)

    const [data, totalRows] = await Promise.all([
      tx.query.tagModel.findMany({
        where,
        orderBy,
        ...pagination,
        extras: {
          contactsCount: (table) =>
            tx.$count(
              contactsToTagsModel,
              eq(contactsToTagsModel.tagId, table.id),
            ),
        },
      }),
      pagination?.limit
        ? tx.$count(tagModel, relationsFilterToSQL(tagModel, where))
        : Promise.resolve(1),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(totalRows / pagination.limit)
      : 1

    return { data, pageCount }
  }

  async findByContactId(props: { contactId: string }, tx: DatabaseClient = db) {
    return await tx.query.tagModel.findMany({
      where: {
        deletedAt: { isNull: true as const },
        contactsToTags: { contactId: props.contactId },
      },
      orderBy: { name: "asc" },
    })
  }

  async findByKey(
    props: { workspaceId: string; key: string; folderId?: string | null },
    tx: DatabaseClient = db,
  ) {
    const { workspaceId, key, folderId } = props
    const folderWhere = toFolderIdFilter(folderId)

    if (isNumericId(key)) {
      const byId = await tx.query.tagModel.findFirst({
        where: {
          id: key,
          workspaceId,
          deletedAt: { isNull: true as const },
          folderId: folderWhere,
        },
      })
      if (byId) {
        return byId
      }
    }

    return await tx.query.tagModel.findFirst({
      where: {
        name: key,
        workspaceId,
        deletedAt: { isNull: true as const },
        folderId: folderWhere,
      },
    })
  }

  async findById(
    props: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.tagModel.findFirst({
      where: {
        id: props.id,
        workspaceId: props.workspaceId,
        deletedAt: { isNull: true as const },
      },
    })
  }

  async existsByName(
    props: { workspaceId: string; name: string; excludeId?: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const existing = await tx.query.tagModel.findFirst({
      columns: { id: true },
      where: {
        name: props.name,
        workspaceId: props.workspaceId,
        deletedAt: { isNull: true as const },
        id: props.excludeId ? { ne: props.excludeId } : undefined,
      },
    })
    return Boolean(existing)
  }

  async findManyByIds(
    props: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (props.ids.length === 0) {
      return []
    }
    return await tx.query.tagModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        id: { in: props.ids },
        deletedAt: { isNull: true as const },
      },
      columns: { id: true },
    })
  }

  async findManyByNames(
    props: { workspaceId: string; names: string[] },
    tx: DatabaseClient = db,
  ) {
    if (props.names.length === 0) {
      return []
    }
    return await tx.query.tagModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        deletedAt: { isNull: true as const },
        name: { in: props.names },
      },
    })
  }

  async create(
    props: { workspaceId: string; name: string; folderId?: string | null },
    tx: DatabaseClient = db,
  ) {
    const [newTag] = await tx
      .insert(tagModel)
      .values({
        id: createId(),
        workspaceId: props.workspaceId,
        name: props.name,
        folderId: props.folderId ?? null,
      })
      .returning()
    return newTag
  }

  async update(
    props: { id: string; workspaceId: string; name: string },
    tx: DatabaseClient = db,
  ) {
    const [updated] = await tx
      .update(tagModel)
      .set({ name: props.name })
      .where(
        and(
          eq(tagModel.id, props.id),
          eq(tagModel.workspaceId, props.workspaceId),
          isNull(tagModel.deletedAt),
        ),
      )
      .returning()
    return updated
  }

  async softDeleteMany(
    props: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (props.ids.length === 0) {
      return []
    }
    return await tx
      .update(tagModel)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(tagModel.workspaceId, props.workspaceId),
          inArray(tagModel.id, props.ids),
          isNull(tagModel.deletedAt),
        ),
      )
      .returning({ id: tagModel.id })
  }

  async ensureByNames(
    props: { workspaceId: string; names: string[] },
    tx: DatabaseClient = db,
  ) {
    if (props.names.length === 0) {
      return []
    }

    await tx
      .insert(tagModel)
      .values(
        props.names.map((name) => ({
          id: createId(),
          name,
          workspaceId: props.workspaceId,
        })),
      )
      .onConflictDoNothing({
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })

    return await tx.query.tagModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        deletedAt: { isNull: true as const },
        name: { in: props.names },
      },
    })
  }

  async linkContacts(
    pairs: TagContactPair[],
    tx: DatabaseClient = db,
  ): Promise<TagContactPair[]> {
    if (pairs.length === 0) {
      return []
    }
    return await tx
      .insert(contactsToTagsModel)
      .values(pairs)
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })
      .returning({
        contactId: contactsToTagsModel.contactId,
        tagId: contactsToTagsModel.tagId,
      })
  }

  async findLinkedTagIds(
    props: { contactId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx.query.contactsToTagsModel.findMany({
      where: { contactId: props.contactId },
      columns: { tagId: true },
    })
    return rows.map((row) => row.tagId)
  }

  async unlinkContacts(
    props: { contactIds: string[]; tagIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<TagContactPair[]> {
    if (props.contactIds.length === 0 || props.tagIds.length === 0) {
      return []
    }
    return await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          inArray(contactsToTagsModel.contactId, props.contactIds),
          inArray(contactsToTagsModel.tagId, props.tagIds),
        ),
      )
      .returning({
        contactId: contactsToTagsModel.contactId,
        tagId: contactsToTagsModel.tagId,
      })
  }

  async unlinkAllFromContact(
    props: { contactId: string },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(contactsToTagsModel)
      .where(eq(contactsToTagsModel.contactId, props.contactId))
  }

  async unlinkContactExcept(
    props: { contactId: string; keepTagIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<{ tagId: string }[]> {
    return await tx
      .delete(contactsToTagsModel)
      .where(
        props.keepTagIds.length > 0
          ? and(
              eq(contactsToTagsModel.contactId, props.contactId),
              notInArray(contactsToTagsModel.tagId, props.keepTagIds),
            )
          : eq(contactsToTagsModel.contactId, props.contactId),
      )
      .returning({ tagId: contactsToTagsModel.tagId })
  }

  async findUnsyncedPairs(
    props: { contactIds: string[]; tagIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<TagContactPair[]> {
    if (props.contactIds.length === 0 || props.tagIds.length === 0) {
      return []
    }

    return await tx
      .select({
        contactId: contactsToTagsModel.contactId,
        tagId: contactsToTagsModel.tagId,
      })
      .from(contactsToTagsModel)
      .where(
        and(
          inArray(contactsToTagsModel.contactId, props.contactIds),
          inArray(contactsToTagsModel.tagId, props.tagIds),
          notExists(
            tx
              .select({ value: sql`1` })
              .from(contactToTagChannelModel)
              .innerJoin(
                contactInboxModel,
                eq(
                  contactToTagChannelModel.contactInboxId,
                  contactInboxModel.id,
                ),
              )
              .where(
                and(
                  eq(
                    contactInboxModel.contactId,
                    contactsToTagsModel.contactId,
                  ),
                  eq(contactToTagChannelModel.tagId, contactsToTagsModel.tagId),
                ),
              ),
          ),
        ),
      )
  }
}

export const tagRepository = new TagRepository()
