import { buildContext } from "@chatbotx.io/business"
import {
  logProviderError,
  logProviderErrorForChannel,
} from "@chatbotx.io/business/error-log"
import { and, db, eq, inArray, isNotNull } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactsToTagsModel,
  contactToTagChannelModel,
  tagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  IntegrationMessengerModel,
  IntegrationZaloModel,
} from "@chatbotx.io/database/types"
import { chunkById } from "@chatbotx.io/database/utils"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo/schema"
import { distributedLock } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import type { JobSyncTag } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

const DELETE_CHUNK_SIZE = 500

type TagWithName = { id: string; name: string; workspaceId: string }

/**
 * Single entry point for every tag-sync job. The `action` discriminator selects
 * the operation: create the channel labels for a new tag, attach/detach a tag
 * on a contact, or delete a tag end-to-end.
 */
export async function handleSyncTag(data: JobSyncTag["data"]): Promise<void> {
  switch (data.action) {
    case "create":
      await syncTagCreate(data)
      return
    case "attach":
      await syncTagAttach(data)
      return
    case "detach":
      await syncTagDetach(data)
      return
    case "delete":
      await syncTagDelete(data)
      return
    default:
      logger.warn({ data }, "syncTag: unknown action")
  }
}

// ---------------------------------------------------------------------------
// create — mirror a newly created tag onto every sync-enabled channel.
// ---------------------------------------------------------------------------

async function syncTagCreate(props: {
  workspaceId: string
  tagId: string
}): Promise<void> {
  const { workspaceId, tagId } = props

  const tag = await db.query.tagModel.findFirst({
    where: { id: tagId, workspaceId },
    columns: { id: true, name: true },
  })
  if (!tag) {
    logger.warn({ tagId }, "syncTag(create): tag missing")
    return
  }

  // Messenger: create the page-level Custom Label on every enabled page.
  const messengerIntegrations =
    await db.query.integrationMessengerModel.findMany({
      where: { workspaceId },
    })
  for (const integration of messengerIntegrations) {
    if (!integration.syncTagEnabledAt) {
      continue
    }
    try {
      await createMessengerLabel({ workspaceId, tag, integration })
    } catch (error) {
      logger.warn(
        { integrationId: integration.id, tagId, error },
        "syncTag(create): messenger label create failed",
      )
      // `messenger` because this is the Messenger pass. The Zalo pass below
      // makes no API call, so it has nothing to attribute — this is exactly
      // the per-loop attribution the removed catch-all could not express.
      await logProviderError({
        provider: "messenger",
        workspaceId,
        error,
      })
    }
  }

  // Zalo: there is no create-empty-tag API — tags materialize on the first
  // tagfollower call. Record the mapping (name-based) on every enabled OA so
  // future assignments + reconciliation resolve correctly; no API call here.
  const zaloIntegrations = await db.query.integrationZaloModel.findMany({
    where: { workspaceId },
  })
  for (const integration of zaloIntegrations) {
    if (!integration.syncTagEnabledAt) {
      continue
    }
    await db
      .insert(tagChannelModel)
      .values({
        id: createId(),
        workspaceId,
        tagId: tag.id,
        channelType: channelTypes.enum.zalo,
        integrationId: integration.id,
        externalLabelId: tag.name,
      })
      .onConflictDoNothing({
        target: [
          tagChannelModel.tagId,
          tagChannelModel.channelType,
          tagChannelModel.integrationId,
        ],
      })
  }
}

async function createMessengerLabel(props: {
  workspaceId: string
  tag: { id: string; name: string }
  integration: IntegrationMessengerModel
}): Promise<void> {
  const { workspaceId, tag, integration } = props
  const ctx = await buildMessengerContext({ workspaceId, integration })

  // Lock per (integration, tag) so concurrent jobs don't create duplicate
  // Facebook labels for the same tag.
  const lockKey = `tag-channel:messenger:${integration.id}:${tag.id}`
  await distributedLock.runExclusive({
    key: lockKey,
    timeoutInSeconds: 30,
    fn: async () => {
      const existing = await db.query.tagChannelModel.findFirst({
        where: {
          tagId: tag.id,
          workspaceId,
          channelType: channelTypes.enum.messenger,
          integrationId: integration.id,
        },
        columns: { id: true },
      })

      const { id: externalLabelId } =
        await integrationMessenger.runChannelHandler("bot", "createLabel", {
          ctx,
          data: { pageId: integration.pageId, name: tag.name },
        })

      if (existing) {
        await db
          .update(tagChannelModel)
          .set({ externalLabelId })
          .where(eq(tagChannelModel.id, existing.id))
        return
      }

      await db
        .insert(tagChannelModel)
        .values({
          id: createId(),
          workspaceId,
          tagId: tag.id,
          channelType: channelTypes.enum.messenger,
          integrationId: integration.id,
          externalLabelId,
        })
        .onConflictDoNothing({
          target: [
            tagChannelModel.tagId,
            tagChannelModel.channelType,
            tagChannelModel.integrationId,
          ],
        })
    },
  })
}

// ---------------------------------------------------------------------------
// attach — assign a tag to a contact on every channel the contact is on.
// ---------------------------------------------------------------------------

async function syncTagAttach(props: {
  workspaceId: string
  contactId: string
  tagId: string
}): Promise<void> {
  const { workspaceId, contactId, tagId } = props

  const tag = await db.query.tagModel.findFirst({
    where: { id: tagId, workspaceId },
    columns: { id: true, name: true, workspaceId: true },
  })
  if (!tag) {
    logger.warn({ tagId }, "syncTag(attach): tag missing")
    return
  }

  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: { contactId },
  })

  for (const contactInbox of contactInboxes) {
    if (contactInbox.channel === channelTypes.enum.messenger) {
      await attachOnMessenger({ workspaceId, tag, contactInbox })
    } else if (contactInbox.channel === channelTypes.enum.zalo) {
      await attachOnZalo({ workspaceId, tag, contactInbox })
    }
  }
}

async function attachOnMessenger(props: {
  workspaceId: string
  tag: TagWithName
  contactInbox: ContactInboxModel
}): Promise<void> {
  const { workspaceId, tag, contactInbox } = props
  const integration = await db.query.integrationMessengerModel.findFirst({
    where: { inboxId: contactInbox.inboxId },
  })
  if (!integration?.syncTagEnabledAt) {
    return
  }

  const ctx = await buildMessengerContext({ workspaceId, integration })

  const lockKey = `tag-channel:messenger:${integration.id}:${tag.id}`
  const tagChannel = await distributedLock.runExclusive({
    key: lockKey,
    timeoutInSeconds: 30,
    fn: async () => {
      const existing = await db.query.tagChannelModel.findFirst({
        where: {
          tagId: tag.id,
          workspaceId,
          channelType: channelTypes.enum.messenger,
          integrationId: integration.id,
        },
      })
      if (existing) {
        return existing
      }

      const { id: externalLabelId } =
        await integrationMessenger.runChannelHandler("bot", "createLabel", {
          ctx,
          data: { pageId: integration.pageId, name: tag.name },
        })

      const inserted = await db
        .insert(tagChannelModel)
        .values({
          id: createId(),
          workspaceId,
          tagId: tag.id,
          channelType: channelTypes.enum.messenger,
          integrationId: integration.id,
          externalLabelId,
        })
        .onConflictDoNothing({
          target: [
            tagChannelModel.tagId,
            tagChannelModel.channelType,
            tagChannelModel.integrationId,
          ],
        })
        .returning()
      if (inserted[0]) {
        return inserted[0]
      }
      return await db.query.tagChannelModel.findFirst({
        where: {
          tagId: tag.id,
          workspaceId,
          channelType: channelTypes.enum.messenger,
          integrationId: integration.id,
        },
      })
    },
  })

  if (!tagChannel) {
    logger.warn(
      { tagId: tag.id, integrationId: integration.id },
      "syncTag(attach): failed to resolve messenger TagChannel",
    )
    return
  }

  await integrationMessenger.runChannelHandler("contact", "assignLabel", {
    ctx,
    data: {
      labelId: tagChannel.externalLabelId,
      sourceId: contactInbox.sourceId,
    },
  })

  await db
    .insert(contactToTagChannelModel)
    .values({
      tagId: tag.id,
      tagChannelId: tagChannel.id,
      contactInboxId: contactInbox.id,
    })
    .onConflictDoNothing()
}

async function attachOnZalo(props: {
  workspaceId: string
  tag: TagWithName
  contactInbox: ContactInboxModel
}): Promise<void> {
  const { workspaceId, tag, contactInbox } = props
  const integration = await db.query.integrationZaloModel.findFirst({
    where: { inboxId: contactInbox.inboxId },
  })
  if (!integration?.syncTagEnabledAt) {
    return
  }

  const ctx = await buildZaloContext({ workspaceId, integration })

  await integrationZalo.runAction("tagFollower", {
    ctx,
    userId: contactInbox.sourceId,
    tagName: tag.name,
  })

  const [tagChannel] = await db
    .insert(tagChannelModel)
    .values({
      id: createId(),
      workspaceId,
      tagId: tag.id,
      channelType: channelTypes.enum.zalo,
      integrationId: integration.id,
      externalLabelId: tag.name,
    })
    .onConflictDoUpdate({
      target: [
        tagChannelModel.tagId,
        tagChannelModel.channelType,
        tagChannelModel.integrationId,
      ],
      set: { externalLabelId: tag.name },
    })
    .returning()

  if (!tagChannel) {
    return
  }

  await db
    .insert(contactToTagChannelModel)
    .values({
      tagId: tag.id,
      tagChannelId: tagChannel.id,
      contactInboxId: contactInbox.id,
    })
    .onConflictDoNothing()
}

// ---------------------------------------------------------------------------
// detach — a tag removed from a contact: unassign on each sync-enabled channel
// and delete the local ContactToTagChannel rows (page label stays).
// ---------------------------------------------------------------------------

async function syncTagDetach(props: {
  workspaceId: string
  contactId: string
  tagId: string
}): Promise<void> {
  const { workspaceId, contactId, tagId } = props

  const rows = await db
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
        eq(contactToTagChannelModel.tagId, tagId),
        eq(contactInboxModel.contactId, contactId),
      ),
    )

  for (const row of rows) {
    try {
      await unassignOnChannel({ workspaceId, row })
    } catch (error) {
      logger.warn(
        { row, error },
        "syncTag(detach): skip per-row unassign error",
      )
      await logProviderErrorForChannel(row.channelType, {
        workspaceId,
        contactId,
        error,
      })
    }
    // Delete the local mapping regardless of sync state / API outcome.
    await db
      .delete(contactToTagChannelModel)
      .where(
        and(
          eq(contactToTagChannelModel.tagChannelId, row.tagChannelId),
          eq(contactToTagChannelModel.contactInboxId, row.contactInboxId),
        ),
      )
  }
}

async function unassignOnChannel(props: {
  workspaceId: string
  row: {
    channelType: string
    integrationId: string
    externalLabelId: string
    sourceId: string
  }
}): Promise<void> {
  const { workspaceId, row } = props

  if (row.channelType === channelTypes.enum.messenger) {
    const ctx = await getMessengerSyncContext({
      workspaceId,
      integrationId: row.integrationId,
    })
    if (!ctx) {
      return
    }
    await integrationMessenger.runChannelHandler("contact", "removeLabel", {
      ctx,
      data: { labelId: row.externalLabelId, sourceId: row.sourceId },
    })
    return
  }

  if (row.channelType === channelTypes.enum.zalo) {
    const ctx = await getZaloSyncContext({
      workspaceId,
      integrationId: row.integrationId,
    })
    if (!ctx) {
      return
    }
    await integrationZalo.runAction("removeFollowerFromTag", {
      ctx,
      userId: row.sourceId,
      tagName: row.externalLabelId,
    })
  }
}

// ---------------------------------------------------------------------------
// delete — remove the label on every sync-enabled channel, then delete the
// local Tag row (cascading TagChannel / ContactToTagChannel / ContactToTag).
// ---------------------------------------------------------------------------

async function syncTagDelete(props: JobSyncTagDelete): Promise<void> {
  const { workspaceId, tagId, channelType, integrationId } = props

  // Channel-scoped delete (inbound webhook): the tag was deleted on ONE channel.
  // Clean only that channel's mappings + the contacts tagged via it; keep the
  // workspace Tag and every other channel intact. The channel already removed
  // the label, so we do NOT call its API again (callApi: false).
  if (channelType && integrationId) {
    const channels = await db.query.tagChannelModel.findMany({
      where: { tagId, workspaceId, channelType, integrationId },
      columns: {
        id: true,
        channelType: true,
        integrationId: true,
        externalLabelId: true,
      },
    })
    for (const channel of channels) {
      await deleteTagOnChannel({ workspaceId, tagId, channel, callApi: false })
    }
    return
  }

  await deleteTagOnChannels({ workspaceId, tagId })
}

type JobSyncTagDelete = Extract<JobSyncTag["data"], { action: "delete" }>

type TagChannelRef = {
  id: string
  channelType: string
  integrationId: string
  externalLabelId: string
}

/**
 * Cleanup for a tag on a SINGLE channel (the reusable unit).
 * Deletes that channel's ContactToTagChannel + the ContactToTag for exactly its
 * contacts (id-paged via chunkById) + the TagChannel row. Does NOT touch the Tag
 * row. `callApi: true` also deletes the label on the channel via the SDK
 * (outbound delete); inbound webhooks pass false since the label is already gone.
 */
async function deleteTagOnChannel(props: {
  workspaceId: string
  tagId: string
  channel: TagChannelRef
  callApi: boolean
}): Promise<void> {
  const { workspaceId, tagId, channel, callApi } = props

  if (callApi) {
    try {
      await deleteLabelOnChannel({ workspaceId, channel })
    } catch (error) {
      logger.warn(
        { tagId, channel, error },
        "syncTag(delete): skip per-channel API error",
      )
      await logProviderErrorForChannel(channel.channelType, {
        workspaceId,
        error,
      })
    }
  }

  // Page this channel's contact assignments by contactInboxId, deleting the
  // channel rows + the workspace tag for those contacts as we go.
  await chunkById(
    (lastId) =>
      db.query.contactToTagChannelModel
        .findMany({
          where: {
            tagChannelId: { in: [channel.id] },
            ...(lastId ? { contactInboxId: { gt: lastId } } : {}),
          },
          orderBy: { contactInboxId: "asc" },
          limit: DELETE_CHUNK_SIZE,
          columns: { contactInboxId: true },
        })
        .then((rows) => rows.map((row) => ({ id: row.contactInboxId }))),
    {
      chunkSize: DELETE_CHUNK_SIZE,
      callback: async (batch) => {
        const contactInboxIds = batch.map((row) => row.id)

        const inboxes = await db.query.contactInboxModel.findMany({
          where: { id: { in: contactInboxIds } },
          columns: { contactId: true },
        })
        const contactIds = [...new Set(inboxes.map((inbox) => inbox.contactId))]

        await db
          .delete(contactToTagChannelModel)
          .where(
            and(
              eq(contactToTagChannelModel.tagChannelId, channel.id),
              inArray(contactToTagChannelModel.contactInboxId, contactInboxIds),
            ),
          )

        if (contactIds.length > 0) {
          await db
            .delete(contactsToTagsModel)
            .where(
              and(
                eq(contactsToTagsModel.tagId, tagId),
                inArray(contactsToTagsModel.contactId, contactIds),
              ),
            )
        }
        return true
      },
    },
  )

  await db.delete(tagChannelModel).where(eq(tagChannelModel.id, channel.id))
}

/**
 * Full workspace delete (delete-tag-action): removes the tag from EVERY channel
 * (via deleteTagOnChannel, calling each channel's API) and deletes the Tag row.
 */
async function deleteTagOnChannels(props: {
  workspaceId: string
  tagId: string
}): Promise<void> {
  const { workspaceId, tagId } = props

  const channels = await db.query.tagChannelModel.findMany({
    where: { tagId, workspaceId },
    columns: {
      id: true,
      channelType: true,
      integrationId: true,
      externalLabelId: true,
    },
  })

  // Isolate per-channel failures so one bad channel can't block the others or
  // the final Tag delete.
  // NOTE: calling the channel API to delete the label is temporarily disabled
  // (callApi: false). Flip back to true to remove the label on the channel too.
  for (const channel of channels) {
    try {
      await deleteTagOnChannel({ workspaceId, tagId, channel, callApi: false })
    } catch (error) {
      logger.warn(
        { tagId, channel, error },
        "syncTag(delete): skip per-channel cleanup error",
      )
    }
  }

  // Catch-all for ContactToTag applied manually (no channel mapping). ContactToTag
  // has a composite PK (no `id`), so page by contactId.
  await chunkById(
    (lastId) =>
      db.query.contactsToTagsModel
        .findMany({
          where: {
            tagId,
            ...(lastId ? { contactId: { gt: lastId } } : {}),
          },
          orderBy: { contactId: "asc" },
          limit: DELETE_CHUNK_SIZE,
          columns: { contactId: true },
        })
        .then((rows) => rows.map((row) => ({ id: row.contactId }))),
    {
      chunkSize: DELETE_CHUNK_SIZE,
      callback: async (batch) => {
        const contactIds = batch.map((row) => row.id)
        await db
          .delete(contactsToTagsModel)
          .where(
            and(
              eq(contactsToTagsModel.tagId, tagId),
              inArray(contactsToTagsModel.contactId, contactIds),
            ),
          )
        return true
      },
    },
  )

  await db
    .delete(tagModel)
    .where(
      and(
        eq(tagModel.id, tagId),
        eq(tagModel.workspaceId, workspaceId),
        isNotNull(tagModel.deletedAt),
      ),
    )
}

async function deleteLabelOnChannel(props: {
  workspaceId: string
  channel: {
    channelType: string
    integrationId: string
    externalLabelId: string
  }
}): Promise<void> {
  const { workspaceId, channel } = props

  if (channel.channelType === channelTypes.enum.messenger) {
    const ctx = await getMessengerSyncContext({
      workspaceId,
      integrationId: channel.integrationId,
    })
    if (!ctx) {
      return
    }
    await integrationMessenger.runChannelHandler("bot", "deleteLabel", {
      ctx,
      data: { labelId: channel.externalLabelId },
    })
    return
  }

  if (channel.channelType === channelTypes.enum.zalo) {
    const ctx = await getZaloSyncContext({
      workspaceId,
      integrationId: channel.integrationId,
    })
    if (!ctx) {
      return
    }
    await integrationZalo.runAction("removeTag", {
      ctx,
      tagName: channel.externalLabelId,
    })
  }
}

// ---------------------------------------------------------------------------
// Channel context helpers (local to tag sync).
// ---------------------------------------------------------------------------

function buildMessengerContext(props: {
  workspaceId: string
  integration: IntegrationMessengerModel
}) {
  const { workspaceId, integration } = props
  return buildContext({
    workspaceId,
    integrationType: channelTypes.enum.messenger,
    integration: {
      ...integration,
      auth: integration.auth as unknown as MessengerAuthValue,
    },
  })
}

function buildZaloContext(props: {
  workspaceId: string
  integration: IntegrationZaloModel
}) {
  const { workspaceId, integration } = props
  return buildContext({
    workspaceId,
    integrationType: channelTypes.enum.zalo,
    integration: {
      ...integration,
      auth: integration.auth as unknown as ZaloAuthValue,
    },
  })
}

/** Resolve a sync-enabled Messenger page by id and build its context. */
async function getMessengerSyncContext(props: {
  workspaceId: string
  integrationId: string
}) {
  const integration = await db.query.integrationMessengerModel.findFirst({
    where: { id: props.integrationId },
  })
  if (!integration?.syncTagEnabledAt) {
    return null
  }
  return await buildMessengerContext({
    workspaceId: props.workspaceId,
    integration,
  })
}

/** Resolve a sync-enabled Zalo OA by id and build its context. */
async function getZaloSyncContext(props: {
  workspaceId: string
  integrationId: string
}) {
  const integration = await db.query.integrationZaloModel.findFirst({
    where: { id: props.integrationId },
  })
  if (!integration?.syncTagEnabledAt) {
    return null
  }
  return await buildZaloContext({
    workspaceId: props.workspaceId,
    integration,
  })
}
