import { and, db, eq, isNull } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  contactsToTagsModel,
  contactToTagChannelModel,
  tagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import { messengerWebhookEventSchema } from "@chatbotx.io/integration-messenger/schema"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"

export interface MessengerLabelWebhookData {
  integrationIdentifier: string
  integrationType: "messenger"
  payload: unknown
}

export async function handleMessengerLabelWebhook(
  data: MessengerLabelWebhookData,
): Promise<void> {
  const { integrationIdentifier: pageId, payload } = data

  const parsed = messengerWebhookEventSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn({ pageId }, "messenger inbox_labels: invalid payload")
    return
  }

  const entry = parsed.data.entry[0]
  const labelChange = entry?.changes?.find(
    (change) => change.field === "inbox_labels",
  )
  if (!labelChange) {
    return
  }
  const { action, user, label } = labelChange.value

  const integration = await db.query.integrationMessengerModel.findFirst({
    where: { pageId },
  })
  if (!integration?.syncTagEnabledAt) {
    return
  }

  switch (action) {
    case "create_label":
      if (!label.page_label_name) {
        return
      }
      await upsertTagAndChannel({
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        externalLabelId: label.id,
        name: label.page_label_name,
      })
      return

    case "delete_label":
      await db
        .delete(tagChannelModel)
        .where(
          and(
            eq(tagChannelModel.workspaceId, integration.workspaceId),
            eq(tagChannelModel.channelType, channelTypes.enum.messenger),
            eq(tagChannelModel.integrationId, integration.id),
            eq(tagChannelModel.externalLabelId, label.id),
          ),
        )
      return

    case "add_label": {
      if (!user) {
        return
      }
      const result = await resolveContactAndTagChannel({
        workspaceId: integration.workspaceId,
        inboxId: integration.inboxId,
        sourceId: user.id,
        integrationId: integration.id,
        externalLabelId: label.id,
      })
      if (!result) {
        return
      }
      await db
        .insert(contactsToTagsModel)
        .values({ contactId: result.contactId, tagId: result.tagId })
        .onConflictDoNothing()
      await db
        .insert(contactToTagChannelModel)
        .values({
          tagId: result.tagId,
          tagChannelId: result.tagChannelId,
          contactInboxId: result.contactInboxId,
        })
        .onConflictDoNothing()
      return
    }

    case "remove_label": {
      if (!user) {
        return
      }
      const result = await resolveContactAndTagChannel({
        workspaceId: integration.workspaceId,
        inboxId: integration.inboxId,
        sourceId: user.id,
        integrationId: integration.id,
        externalLabelId: label.id,
      })
      if (!result) {
        return
      }
      await db
        .delete(contactToTagChannelModel)
        .where(
          and(
            eq(contactToTagChannelModel.tagChannelId, result.tagChannelId),
            eq(contactToTagChannelModel.contactInboxId, result.contactInboxId),
          ),
        )
      return
    }

    default:
      logger.warn({ action }, "messenger inbox_labels: unknown action")
  }
}

async function upsertTagAndChannel(props: {
  workspaceId: string
  integrationId: string
  externalLabelId: string
  name: string
}): Promise<{ tagId: string; tagChannelId: string } | undefined> {
  const { workspaceId, integrationId, externalLabelId, name } = props

  const existingTag = await db.query.tagModel.findFirst({
    where: { workspaceId, name, deletedAt: { isNull: true as const } },
    columns: { id: true },
  })
  let tagId = existingTag?.id
  if (!tagId) {
    const inserted = await db
      .insert(tagModel)
      .values({ id: createId(), name, workspaceId })
      .onConflictDoNothing({
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })
      .returning({ id: tagModel.id })
    tagId =
      inserted[0]?.id ??
      (
        await db.query.tagModel.findFirst({
          where: { workspaceId, name, deletedAt: { isNull: true as const } },
          columns: { id: true },
        })
      )?.id
  }
  if (!tagId) {
    return
  }

  const inserted = await db
    .insert(tagChannelModel)
    .values({
      id: createId(),
      workspaceId,
      tagId,
      channelType: channelTypes.enum.messenger,
      integrationId,
      externalLabelId,
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
          tagId,
          workspaceId,
          channelType: channelTypes.enum.messenger,
          integrationId,
        },
        columns: { id: true },
      })
    )?.id
  if (!tagChannelId) {
    return
  }

  return { tagId, tagChannelId }
}

async function resolveContactAndTagChannel(props: {
  workspaceId: string
  inboxId: string
  sourceId: string
  integrationId: string
  externalLabelId: string
}): Promise<
  | {
      contactId: string
      contactInboxId: string
      tagId: string
      tagChannelId: string
    }
  | undefined
> {
  const { workspaceId, inboxId, sourceId, integrationId, externalLabelId } =
    props

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: { inboxId, sourceId },
    columns: { id: true, contactId: true },
  })
  if (!contactInbox) {
    return
  }

  const tagChannel = await db.query.tagChannelModel.findFirst({
    where: {
      workspaceId,
      channelType: channelTypes.enum.messenger,
      integrationId,
      externalLabelId,
    },
    columns: { id: true, tagId: true },
  })
  if (!tagChannel) {
    return
  }

  return {
    contactId: contactInbox.contactId,
    contactInboxId: contactInbox.id,
    tagId: tagChannel.tagId,
    tagChannelId: tagChannel.id,
  }
}
