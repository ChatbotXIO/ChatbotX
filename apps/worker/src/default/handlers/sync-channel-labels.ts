import { buildContext } from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { db, isNull, sql } from "@chatbotx.io/database/client"
import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import {
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
import { createId } from "@chatbotx.io/utils"
import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"
import type { JobSyncChannelLabels } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 100
const SLEEP_MS = 200

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

interface NormalizedLabel {
  externalLabelId: string
  name: string
}

export async function handleSyncChannelLabels(
  data: JobSyncChannelLabels["data"],
): Promise<void> {
  const { workspaceId, channelType, integrationId } = data

  if (channelType === channelTypes.enum.messenger) {
    const integration = await db.query.integrationMessengerModel.findFirst({
      where: { id: integrationId },
    })

    if (!integration) {
      logger.warn({ integrationId }, "scan: messenger integration not found")
      return
    }

    await runMessengerScan({ workspaceId, integration })
  }

  if (channelType === channelTypes.enum.zalo) {
    const integration = await db.query.integrationZaloModel.findFirst({
      where: { id: integrationId },
    })

    if (!integration) {
      logger.warn({ integrationId }, "scan: zalo integration not found")
      return
    }

    await runZaloScan({ workspaceId, integration })
  }
}

async function runMessengerScan(props: {
  workspaceId: string
  integration: IntegrationMessengerModel
}): Promise<void> {
  const { workspaceId, integration } = props
  const ctx = await buildContext({
    workspaceId,
    integrationType: channelTypes.enum.messenger,
    integration: {
      ...integration,
      auth: integration.auth as unknown as MessengerAuthValue,
    },
  })

  await scanContactInboxes(
    { workspaceId, provider: "messenger" },
    integration.inboxId,
    async (contactInbox) => {
      const fbLabels = await integrationMessenger.runChannelHandler(
        "bot",
        "listLabels",
        { ctx, data: { sourceId: contactInbox.sourceId } },
      )
      const labels: NormalizedLabel[] = fbLabels.map((fbLabel) => ({
        externalLabelId: fbLabel.id,
        name: fbLabel.name,
      }))
      for (const label of labels) {
        await upsertLabelMapping({
          workspaceId,
          channelType: channelTypes.enum.messenger,
          integrationId: integration.id,
          label,
          contactInbox,
        })
      }
    },
  )
}

async function runZaloScan(props: {
  workspaceId: string
  integration: IntegrationZaloModel
}): Promise<void> {
  const { workspaceId, integration } = props
  const ctx = await buildContext({
    workspaceId,
    integrationType: channelTypes.enum.zalo,
    integration: {
      ...integration,
      auth: integration.auth as unknown as ZaloAuthValue,
    },
  })

  await scanContactInboxes(
    { workspaceId, provider: "zalo" },
    integration.inboxId,
    async (contactInbox) => {
      const detail = await integrationZalo.runAction("getUserDetail", {
        ctx,
        userId: contactInbox.sourceId,
      })
      const names = detail.tags_and_notes_info?.tag_names ?? []
      const labels: NormalizedLabel[] = names.map((name) => ({
        externalLabelId: name,
        name,
      }))
      for (const label of labels) {
        await upsertLabelMapping({
          workspaceId,
          channelType: channelTypes.enum.zalo,
          integrationId: integration.id,
          label,
          contactInbox,
        })
      }
    },
  )
}

async function scanContactInboxes(
  // `workspaceId` and `provider` exist only so the catch below can attribute
  // the failure: the scanned rows carry neither, and this helper is shared by
  // the Messenger and Zalo scans.
  attribution: { workspaceId: string; provider: ErrorLogProvider },
  inboxId: string,
  processContact: (contactInbox: ContactInboxModel) => Promise<void>,
): Promise<void> {
  // One `ErrorLog` row per scan, not per contact. Every failure mode worth
  // recording here is per-*integration* — an expired page token fails
  // `listLabels` for every contact on the inbox — so a row each would write one
  // per `ContactInbox` on the inbox (six figures for a large workspace), bury
  // every other failure in the feed, and evict unrelated events from the 50k
  // error-log stream. This is the same collapsing `BULK_SEND_ORIGINS` does for
  // broadcast fan-out; the per-contact detail stays in the app logger below.
  let firstFailure: unknown
  let failureCount = 0

  await chunkById(
    (lastId) =>
      db.query.contactInboxModel.findMany({
        where: {
          inboxId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: "asc" },
        limit: BATCH_SIZE,
      }),
    {
      chunkSize: BATCH_SIZE,
      callback: async (batch) => {
        for (const contactInbox of batch) {
          try {
            await processContact(contactInbox)
          } catch (error) {
            logger.warn(
              { contactInboxId: contactInbox.id, error },
              "scan: per-user error, skipping",
            )
            if (failureCount === 0) {
              firstFailure = error
            }
            failureCount++
          }
          await sleep(SLEEP_MS)
        }
        return true
      },
    },
  )

  if (failureCount === 0) {
    return
  }

  logger.warn(
    { failureCount, inboxId, provider: attribution.provider },
    "scan: contacts failed, recording one error log for the run",
  )
  // No `contactId`: the row stands for the whole scan, and pinning it to
  // whichever contact happened to fail first would read as a contact-specific
  // problem in the workspace's feed.
  await logProviderError({
    provider: attribution.provider,
    workspaceId: attribution.workspaceId,
    error: firstFailure,
  })
}

async function upsertLabelMapping(props: {
  workspaceId: string
  channelType: ChannelType
  integrationId: string
  label: NormalizedLabel
  contactInbox: ContactInboxModel
}): Promise<void> {
  const { workspaceId, channelType, integrationId, label, contactInbox } = props

  const [tag] = await db
    .insert(tagModel)
    .values({ id: createId(), name: label.name, workspaceId })
    .onConflictDoUpdate({
      target: [tagModel.workspaceId, tagModel.name],
      targetWhere: isNull(tagModel.deletedAt),
      set: { name: sql`EXCLUDED.name` },
    })
    .returning({ id: tagModel.id })
  if (!tag) {
    return
  }

  const [tagChannel] = await db
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
      target: [
        tagChannelModel.tagId,
        tagChannelModel.channelType,
        tagChannelModel.integrationId,
      ],
      set: { externalLabelId: sql`EXCLUDED."externalLabelId"` },
    })
    .returning({ id: tagChannelModel.id })
  if (!tagChannel) {
    return
  }

  await db
    .insert(contactsToTagsModel)
    .values({ contactId: contactInbox.contactId, tagId: tag.id })
    .onConflictDoNothing()
  await db
    .insert(contactToTagChannelModel)
    .values({
      tagId: tag.id,
      tagChannelId: tagChannel.id,
      contactInboxId: contactInbox.id,
    })
    .onConflictDoNothing()
}
