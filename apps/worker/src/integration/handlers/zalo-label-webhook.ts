import { and, db, eq, inArray, isNull } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  contactsToTagsModel,
  contactToTagChannelModel,
  type integrationZaloModel,
  tagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { logger } from "../../lib/logger"

const zaloTagEventSchema = z.object({
  app_id: z.string().optional(),
  event_name: z.enum(["add_user_to_tag", "remove_user_from_tag", "remove_tag"]),
  oa_id: z.string(),
  tag: z.object({
    name: z.string(),
    user_ids: z.array(z.string()).max(200).optional(),
  }),
  timestamp: z.string().optional(),
})
type ZaloTagEvent = z.infer<typeof zaloTagEventSchema>

export interface ZaloLabelWebhookData {
  integrationIdentifier: string
  integrationType: "zalo"
  payload: unknown
}

export async function handleZaloLabelWebhook(
  data: ZaloLabelWebhookData,
): Promise<void> {
  const { integrationIdentifier: oaId, payload } = data

  const parsed = zaloTagEventSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn({ oaId }, "zalo label webhook: invalid payload")
    return
  }
  const event = parsed.data

  // NOTE: Zalo webhook signature verification is disabled project-wide (raw
  // body is not captured upstream). If enabled later, verify the X-ZEvent
  // signature in the integration webhook handler using the raw request body.

  const integration = await db.query.integrationZaloModel.findFirst({
    where: { oaId },
  })
  if (!integration?.syncTagEnabledAt) {
    return
  }

  switch (event.event_name) {
    case "add_user_to_tag":
      await handleAddUserToTag({ integration, event })
      return
    case "remove_user_from_tag":
      await handleRemoveUserFromTag({ integration, event })
      return
    case "remove_tag":
      await db
        .delete(tagChannelModel)
        .where(
          and(
            eq(tagChannelModel.workspaceId, integration.workspaceId),
            eq(tagChannelModel.channelType, channelTypes.enum.zalo),
            eq(tagChannelModel.integrationId, integration.id),
            eq(tagChannelModel.externalLabelId, event.tag.name),
          ),
        )
      return
    default:
      logger.warn({ event }, "zalo label webhook: unknown event")
  }
}

async function handleAddUserToTag(props: {
  integration: typeof integrationZaloModel.$inferSelect
  event: ZaloTagEvent
}): Promise<void> {
  const { integration, event } = props

  // Doc-typo defense: missing user_ids → label-only create
  if (!event.tag.user_ids?.length) {
    await ensureTagAndChannel({
      workspaceId: integration.workspaceId,
      integrationId: integration.id,
      name: event.tag.name,
    })
    return
  }

  const tagInfo = await ensureTagAndChannel({
    workspaceId: integration.workspaceId,
    integrationId: integration.id,
    name: event.tag.name,
  })
  if (!tagInfo) {
    return
  }

  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: {
      inboxId: integration.inboxId,
      sourceId: { in: event.tag.user_ids },
    },
    columns: { id: true, contactId: true },
  })
  if (contactInboxes.length === 0) {
    return
  }

  await db
    .insert(contactsToTagsModel)
    .values(
      contactInboxes.map((contactInbox) => ({
        contactId: contactInbox.contactId,
        tagId: tagInfo.tagId,
      })),
    )
    .onConflictDoNothing()
  await db
    .insert(contactToTagChannelModel)
    .values(
      contactInboxes.map((contactInbox) => ({
        tagId: tagInfo.tagId,
        tagChannelId: tagInfo.tagChannelId,
        contactInboxId: contactInbox.id,
      })),
    )
    .onConflictDoNothing()
}

async function handleRemoveUserFromTag(props: {
  integration: typeof integrationZaloModel.$inferSelect
  event: ZaloTagEvent
}): Promise<void> {
  const { integration, event } = props
  if (!event.tag.user_ids?.length) {
    return
  }

  const tagChannel = await db.query.tagChannelModel.findFirst({
    where: {
      workspaceId: integration.workspaceId,
      channelType: channelTypes.enum.zalo,
      integrationId: integration.id,
      externalLabelId: event.tag.name,
    },
    columns: { id: true },
  })
  if (!tagChannel) {
    return
  }

  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: {
      inboxId: integration.inboxId,
      sourceId: { in: event.tag.user_ids },
    },
    columns: { id: true },
  })
  if (contactInboxes.length === 0) {
    return
  }

  await db.delete(contactToTagChannelModel).where(
    and(
      eq(contactToTagChannelModel.tagChannelId, tagChannel.id),
      inArray(
        contactToTagChannelModel.contactInboxId,
        contactInboxes.map((contactInbox) => contactInbox.id),
      ),
    ),
  )
}

async function ensureTagAndChannel(props: {
  workspaceId: string
  integrationId: string
  name: string
}): Promise<{ tagId: string; tagChannelId: string } | undefined> {
  const { workspaceId, integrationId, name } = props

  let tag = await db.query.tagModel.findFirst({
    where: { workspaceId, name, deletedAt: { isNull: true as const } },
    columns: { id: true },
  })
  if (!tag) {
    const inserted = await db
      .insert(tagModel)
      .values({ id: createId(), workspaceId, name })
      .onConflictDoNothing({
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })
      .returning({ id: tagModel.id })
    tag =
      inserted[0] ??
      (await db.query.tagModel.findFirst({
        where: { workspaceId, name, deletedAt: { isNull: true as const } },
        columns: { id: true },
      }))
  }
  if (!tag) {
    return
  }

  const inserted = await db
    .insert(tagChannelModel)
    .values({
      id: createId(),
      workspaceId,
      tagId: tag.id,
      channelType: channelTypes.enum.zalo,
      integrationId,
      externalLabelId: name,
    })
    .onConflictDoNothing({
      target: [
        tagChannelModel.tagId,
        tagChannelModel.channelType,
        tagChannelModel.integrationId,
      ],
    })
    .returning({ id: tagChannelModel.id })

  const tagChannelId =
    inserted[0]?.id ??
    (
      await db.query.tagChannelModel.findFirst({
        where: {
          tagId: tag.id,
          workspaceId,
          channelType: channelTypes.enum.zalo,
          integrationId,
        },
        columns: { id: true },
      })
    )?.id
  if (!tagChannelId) {
    return
  }

  return { tagId: tag.id, tagChannelId }
}
