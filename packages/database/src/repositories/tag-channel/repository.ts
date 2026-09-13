import { createId } from "@chatbotx.io/utils"
import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import {
  contactInboxModel,
  contactsToTagsModel,
  contactToTagChannelModel,
  tagChannelModel,
  tagModel,
} from "../../schema"
import type { TagChannelModel } from "../../types"

// A function, not a module-scope constant: referencing `tagChannelModel`'s
// columns at import time breaks any test that partially mocks
// `@chatbotx.io/database/schema` without `tagChannelModel`, even when that
// test never touches tag-channel code — it only imports the repositories
// barrel. Computing this lazily, inside each call, avoids that.
const tagChannelConflictTarget = () => [
  tagChannelModel.tagId,
  tagChannelModel.channelType,
  tagChannelModel.integrationId,
]

export type ContactTagChannelRow = {
  tagChannelId: string
  contactInboxId: string
  channelType: string
  integrationId: string
  externalLabelId: string
  sourceId: string
}

/**
 * Consolidated data-access layer for `TagChannel` / `ContactToTagChannel` /
 * `ContactsToTags` mutations used by the `sync-channel-labels` and `sync-tag`
 * worker handlers. Every method below is a verbatim move of the query body
 * that used to live inline in those handlers.
 */
export const tagChannelRepository = {
  /**
   * Inbound-scan upsert path (`sync-channel-labels.ts`): creates or renames
   * the workspace `Tag`, its `TagChannel` mapping, and links the scanned
   * contact inbox to both. Each step exits early when its own insert/upsert
   * fails to return a row (mirrors the original handler's early-return
   * chain).
   */
  async upsertLabelMapping(
    input: {
      workspaceId: string
      channelType: string
      integrationId: string
      label: { externalLabelId: string; name: string }
      contactInbox: { id: string; contactId: string }
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const { workspaceId, channelType, integrationId, label, contactInbox } =
      input

    const [tag] = await tx
      .insert(tagModel)
      .values({ id: createId(), name: label.name, workspaceId })
      .onConflictDoUpdate({
        target: [tagModel.workspaceId, tagModel.name],
        targetWhere: sql`"deletedAt" IS NULL`,
        set: { name: sql`EXCLUDED.name` },
      })
      .returning({ id: tagModel.id })
    if (!tag) {
      return
    }

    const [tagChannel] = await tx
      .insert(tagChannelModel)
      .values({
        id: createId(),
        workspaceId,
        tagId: tag.id,
        channelType,
        integrationId,
        externalLabelId: label.externalLabelId,
      })
      .onConflictDoUpdate({
        target: tagChannelConflictTarget(),
        set: { externalLabelId: sql`EXCLUDED."externalLabelId"` },
      })
      .returning({ id: tagChannelModel.id })
    if (!tagChannel) {
      return
    }

    await tx
      .insert(contactsToTagsModel)
      .values({ contactId: contactInbox.contactId, tagId: tag.id })
      .onConflictDoNothing()
    await tx
      .insert(contactToTagChannelModel)
      .values({
        tagId: tag.id,
        tagChannelId: tagChannel.id,
        contactInboxId: contactInbox.id,
      })
      .onConflictDoNothing()
  },

  /** `sync-tag(create)` Zalo path: name-based mapping, no API call. */
  async insertIfAbsent(
    input: {
      workspaceId: string
      tagId: string
      channelType: string
      integrationId: string
      externalLabelId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .insert(tagChannelModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        tagId: input.tagId,
        channelType: input.channelType,
        integrationId: input.integrationId,
        externalLabelId: input.externalLabelId,
      })
      .onConflictDoNothing({ target: tagChannelConflictTarget() })
  },

  async findByTagAndIntegration(
    input: {
      workspaceId: string
      tagId: string
      channelType: string
      integrationId: string
    },
    tx: DatabaseClient = db,
  ): Promise<TagChannelModel | undefined> {
    return await tx.query.tagChannelModel.findFirst({
      where: {
        tagId: input.tagId,
        workspaceId: input.workspaceId,
        channelType: input.channelType,
        integrationId: input.integrationId,
      },
    })
  },

  async updateExternalLabelId(
    input: { id: string; externalLabelId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(tagChannelModel)
      .set({ externalLabelId: input.externalLabelId })
      .where(eq(tagChannelModel.id, input.id))
  },

  /**
   * `sync-tag(attach)` messenger path: insert-then-refetch fallback so a
   * concurrent job that already inserted the mapping still resolves the
   * winning row.
   */
  async insertOrFetch(
    input: {
      workspaceId: string
      tagId: string
      channelType: string
      integrationId: string
      externalLabelId: string
    },
    tx: DatabaseClient = db,
  ): Promise<TagChannelModel | undefined> {
    const inserted = await tx
      .insert(tagChannelModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        tagId: input.tagId,
        channelType: input.channelType,
        integrationId: input.integrationId,
        externalLabelId: input.externalLabelId,
      })
      .onConflictDoNothing({ target: tagChannelConflictTarget() })
      .returning()
    if (inserted[0]) {
      return inserted[0]
    }
    return await tx.query.tagChannelModel.findFirst({
      where: {
        tagId: input.tagId,
        workspaceId: input.workspaceId,
        channelType: input.channelType,
        integrationId: input.integrationId,
      },
    })
  },

  /** `sync-tag(attach)` Zalo path: upsert keyed by the tag's own name. */
  async upsertByTagAndIntegration(
    input: {
      workspaceId: string
      tagId: string
      channelType: string
      integrationId: string
      externalLabelId: string
    },
    tx: DatabaseClient = db,
  ): Promise<TagChannelModel | undefined> {
    const [tagChannel] = await tx
      .insert(tagChannelModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        tagId: input.tagId,
        channelType: input.channelType,
        integrationId: input.integrationId,
        externalLabelId: input.externalLabelId,
      })
      .onConflictDoUpdate({
        target: tagChannelConflictTarget(),
        set: { externalLabelId: input.externalLabelId },
      })
      .returning()
    return tagChannel
  },

  async linkContactInbox(
    input: { tagId: string; tagChannelId: string; contactInboxId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .insert(contactToTagChannelModel)
      .values({
        tagId: input.tagId,
        tagChannelId: input.tagChannelId,
        contactInboxId: input.contactInboxId,
      })
      .onConflictDoNothing()
  },

  async unlinkContactInbox(
    input: { tagChannelId: string; contactInboxId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(contactToTagChannelModel)
      .where(
        and(
          eq(contactToTagChannelModel.tagChannelId, input.tagChannelId),
          eq(contactToTagChannelModel.contactInboxId, input.contactInboxId),
        ),
      )
  },

  /**
   * `sync-tag(detach)`: the 3-table join resolving every channel this
   * contact's tag is currently mapped onto, so the caller can unassign on
   * each channel before deleting the local link.
   */
  async listContactTagChannelRows(
    input: { tagId: string; contactId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactTagChannelRow[]> {
    return await tx
      .select({
        tagChannelId: contactToTagChannelModel.tagChannelId,
        contactInboxId: contactToTagChannelModel.contactInboxId,
        channelType: tagChannelModel.channelType,
        integrationId: tagChannelModel.integrationId,
        externalLabelId: tagChannelModel.externalLabelId,
        sourceId: contactInboxModel.sourceId,
      })
      .from(contactToTagChannelModel)
      .innerJoin(
        tagChannelModel,
        eq(contactToTagChannelModel.tagChannelId, tagChannelModel.id),
      )
      .innerJoin(
        contactInboxModel,
        eq(contactToTagChannelModel.contactInboxId, contactInboxModel.id),
      )
      .where(
        and(
          eq(contactToTagChannelModel.tagId, input.tagId),
          eq(contactInboxModel.contactId, input.contactId),
        ),
      )
  },

  async listByTag(
    input: {
      workspaceId: string
      tagId: string
      channelType?: string
      integrationId?: string
    },
    tx: DatabaseClient = db,
  ): Promise<
    Pick<
      TagChannelModel,
      "id" | "channelType" | "integrationId" | "externalLabelId"
    >[]
  > {
    return await tx.query.tagChannelModel.findMany({
      where: {
        tagId: input.tagId,
        workspaceId: input.workspaceId,
        ...(input.channelType ? { channelType: input.channelType } : {}),
        ...(input.integrationId ? { integrationId: input.integrationId } : {}),
      },
      columns: {
        id: true,
        channelType: true,
        integrationId: true,
        externalLabelId: true,
      },
    })
  },

  async deleteById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx.delete(tagChannelModel).where(eq(tagChannelModel.id, input.id))
  },

  /** `sync-tag(delete)` per-channel page: id-paged by `contactInboxId`. */
  async listContactInboxIdsForChannelPage(
    input: {
      tagChannelId: string
      afterContactInboxId?: string
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<{ contactInboxId: string }[]> {
    const rows = await tx.query.contactToTagChannelModel.findMany({
      where: {
        tagChannelId: { in: [input.tagChannelId] },
        ...(input.afterContactInboxId
          ? { contactInboxId: { gt: input.afterContactInboxId } }
          : {}),
      },
      orderBy: { contactInboxId: "asc" },
      limit: input.limit,
      columns: { contactInboxId: true },
    })
    return rows
  },

  async deleteLinksForChannel(
    input: { tagChannelId: string; contactInboxIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.contactInboxIds.length === 0) {
      return
    }
    await tx
      .delete(contactToTagChannelModel)
      .where(
        and(
          eq(contactToTagChannelModel.tagChannelId, input.tagChannelId),
          inArray(
            contactToTagChannelModel.contactInboxId,
            input.contactInboxIds,
          ),
        ),
      )
  },

  async deleteContactTagsForContacts(
    input: { tagId: string; contactIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.contactIds.length === 0) {
      return
    }
    await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.tagId, input.tagId),
          inArray(contactsToTagsModel.contactId, input.contactIds),
        ),
      )
  },

  /** `sync-tag(delete)` catch-all page: id-paged by `contactId`. */
  async listTaggedContactIdsPage(
    input: { tagId: string; afterContactId?: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<{ contactId: string }[]> {
    const rows = await tx.query.contactsToTagsModel.findMany({
      where: {
        tagId: input.tagId,
        ...(input.afterContactId
          ? { contactId: { gt: input.afterContactId } }
          : {}),
      },
      orderBy: { contactId: "asc" },
      limit: input.limit,
      columns: { contactId: true },
    })
    return rows
  },
}
