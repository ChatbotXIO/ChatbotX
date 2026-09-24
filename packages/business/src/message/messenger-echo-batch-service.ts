import {
  type CreateMessageInput,
  contactInboxRepository,
  contactRepository,
  createMessageRepository,
  type MessageSourceRow,
} from "@chatbotx.io/database/repositories"
import type { InboxModel, MessageModel } from "@chatbotx.io/database/types"
import type { BroadcastTarget } from "@chatbotx.io/partysocket-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import type {
  ContentType,
  EchoAttachmentDescriptor,
  IncomingAttachment,
  IncomingContact,
} from "@chatbotx.io/sdk"
import { createId, mapWithConcurrency } from "@chatbotx.io/utils"
import { bulkImportChannelContacts } from "../contact/bulk-import-channel-contacts"
import { contactInboxService } from "../contact-inbox/service"
import { finalizeContactProfile } from "../contact-locale"
import { conversationService } from "../conversation/service"
import { logger } from "../logger"
import { broadcastToWorkspaceParty } from "../platform/realtime-broadcast"

const ECHO_DEDUP_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000
/** Default parallelism for Messenger echo profile lookups. */
export const MESSENGER_ECHO_DEFAULT_PROFILE_CONCURRENCY = 5
/** Default parallelism for Messenger echo attachment downloads. */
export const MESSENGER_ECHO_DEFAULT_ATTACHMENT_CONCURRENCY = 5

export type EchoContactProfile = Pick<
  IncomingContact,
  "firstName" | "lastName" | "gender" | "locale" | "language" | "timezone"
>

export type EchoBatchItem<
  TRaw = unknown,
  TAttachmentDescriptor extends
    EchoAttachmentDescriptor = EchoAttachmentDescriptor,
> = {
  sourceId: string
  contactSourceId: string
  createdAt: Date
  text?: string | null
  contentType: ContentType
  contentAttributes?: Record<string, unknown> | null
  attachments: TAttachmentDescriptor[]
  raw: TRaw
}

export type PersistedTextEchoEntry<
  TRaw = unknown,
  TAttachmentDescriptor extends
    EchoAttachmentDescriptor = EchoAttachmentDescriptor,
> = {
  row: MessageModel
  item: EchoBatchItem<TRaw, TAttachmentDescriptor>
  contactInboxId: string
  conversationId: string
}

export type EchoBatchPorts<
  TRaw = unknown,
  TAttachmentDescriptor extends
    EchoAttachmentDescriptor = EchoAttachmentDescriptor,
> = {
  fetchProfile(contactSourceId: string): Promise<EchoContactProfile>
  downloadAttachments(
    item: EchoBatchItem<TRaw, TAttachmentDescriptor>,
  ): Promise<IncomingAttachment[]>
  onTextMessagesPersisted(
    entries: PersistedTextEchoEntry<TRaw, TAttachmentDescriptor>[],
  ): Promise<void>
  fallbackToSingleEvent(
    item: EchoBatchItem<TRaw, TAttachmentDescriptor>,
    error: unknown,
  ): Promise<void>
}

export type EchoBatchResult = {
  items: number
  dedupedItems: number
  contactsCreated: number
  messagesInserted: number
  duplicatesSkipped: number
  attachmentsWritten: number
  attachmentFailures: number
  perItemFailures: number
}

type ResolvedItem<
  TRaw,
  TAttachmentDescriptor extends EchoAttachmentDescriptor,
> = {
  item: EchoBatchItem<TRaw, TAttachmentDescriptor>
  contactId: string
  contactInboxId: string
  conversationId: string
  createdAt: Date
}

type ResolvedMessage<
  TRaw,
  TAttachmentDescriptor extends EchoAttachmentDescriptor,
> = ResolvedItem<TRaw, TAttachmentDescriptor> & {
  message: MessageSourceRow
}

const messageKey = (row: {
  contactInboxId: string
  sourceId: string | null
  createdAt: Date
}): string =>
  `${row.contactInboxId}\u0000${row.sourceId ?? ""}\u0000${row.createdAt.getTime()}`

const messageSourceKey = (row: {
  contactInboxId: string
  sourceId: string | null
}): string => `${row.contactInboxId}\u0000${row.sourceId ?? ""}`

const attachmentMessageKey = (row: {
  messageId: string
  messageCreatedAt: Date
}): string => `${row.messageId}\u0000${row.messageCreatedAt.getTime()}`

const attachmentKey = (row: {
  messageId: string
  messageCreatedAt: Date
  sourceId: string
}): string => `${attachmentMessageKey(row)}\u0000${row.sourceId}`

const asError = (message: string): Error => new Error(message)

const findPersistedEchoMessages = async (props: {
  workspaceId: string
  items: Array<{ contactInboxId: string; sourceId: string }>
  now: Date
}) => {
  const repository = await createMessageRepository()
  const sinceTime = new Date(props.now.getTime() - ECHO_DEDUP_LOOKBACK_MS)
  const requestedMessageKeys = new Set(props.items.map(messageSourceKey))
  const lookup = {
    workspaceId: props.workspaceId,
    contactInboxIds: props.items.map((item) => item.contactInboxId),
    sourceIds: props.items.map((item) => item.sourceId),
    sinceTime,
  }
  const [crossShardRows, writeShardRows] = await Promise.all([
    repository.findManyBySourceIds({ ...lookup, strict: true }),
    repository.findManyOnWriteShardBySourceIds(lookup),
  ])
  const rowBySourceKey = new Map(
    [...crossShardRows, ...writeShardRows]
      .filter((row) => requestedMessageKeys.has(messageSourceKey(row)))
      .map((row) => [messageSourceKey(row), row]),
  )

  return { repository, rowBySourceKey, writeShardRows }
}

class MessengerEchoBatchService {
  async findPersistedSourceIds<
    TRaw,
    TAttachmentDescriptor extends EchoAttachmentDescriptor,
  >(props: {
    inbox: Pick<InboxModel, "id" | "workspaceId">
    items: EchoBatchItem<TRaw, TAttachmentDescriptor>[]
  }): Promise<Set<string>> {
    if (props.items.length === 0) {
      return new Set()
    }

    const contactSourceIds = [
      ...new Set(props.items.map((item) => item.contactSourceId)),
    ]
    const contactInboxes = await contactInboxRepository.findByInboxAndSourceIds(
      {
        inboxId: props.inbox.id,
        sourceIds: contactSourceIds,
      },
    )
    const contactInboxIdBySourceId = new Map(
      contactInboxes.flatMap((row) =>
        row.sourceId ? [[row.sourceId, row.id] as const] : [],
      ),
    )
    const resolvedItems = props.items.flatMap((item) => {
      const contactInboxId = contactInboxIdBySourceId.get(item.contactSourceId)
      return contactInboxId ? [{ contactInboxId, sourceId: item.sourceId }] : []
    })
    if (resolvedItems.length === 0) {
      return new Set()
    }

    const { rowBySourceKey } = await findPersistedEchoMessages({
      workspaceId: props.inbox.workspaceId,
      items: resolvedItems,
      now: new Date(),
    })
    return new Set(
      resolvedItems.flatMap((item) =>
        rowBySourceKey.has(messageSourceKey(item)) ? [item.sourceId] : [],
      ),
    )
  }

  /**
   * Persists already-parsed outgoing echoes in bulk. Despite the historical
   * name, this orchestration is channel-agnostic so Instagram can reuse it.
   */
  async process<
    TRaw,
    TAttachmentDescriptor extends EchoAttachmentDescriptor,
  >(props: {
    inbox: Pick<InboxModel, "id" | "workspaceId" | "channel">
    ownerId: string
    realtimeTarget: BroadcastTarget
    items: EchoBatchItem<TRaw, TAttachmentDescriptor>[]
    ports: EchoBatchPorts<TRaw, TAttachmentDescriptor>
    options?: {
      profileConcurrency?: number
      attachmentConcurrency?: number
      now?: () => Date
    }
  }): Promise<EchoBatchResult> {
    const { inbox, ownerId, realtimeTarget, ports } = props
    const now = props.options?.now?.() ?? new Date()
    const deduped = new Map<
      string,
      EchoBatchItem<TRaw, TAttachmentDescriptor>
    >()
    for (const item of props.items) {
      if (!deduped.has(item.sourceId)) {
        deduped.set(item.sourceId, item)
      }
    }
    const items = [...deduped.values()]
    const summary: EchoBatchResult = {
      items: props.items.length,
      dedupedItems: items.length,
      contactsCreated: 0,
      messagesInserted: 0,
      duplicatesSkipped: 0,
      attachmentsWritten: 0,
      attachmentFailures: 0,
      perItemFailures: 0,
    }
    if (items.length === 0) {
      return summary
    }

    const contactSourceIds = [
      ...new Set(items.map((item) => item.contactSourceId)),
    ]
    const existingContactSourceIds = new Set(
      (
        await contactInboxRepository.findByInboxAndSourceIds({
          inboxId: inbox.id,
          sourceIds: contactSourceIds,
        })
      ).flatMap((row) => (row.sourceId ? [row.sourceId] : [])),
    )
    const unknownContactSourceIds = contactSourceIds.filter(
      (sourceId) => !existingContactSourceIds.has(sourceId),
    )
    const profileResults = await mapWithConcurrency(
      unknownContactSourceIds,
      props.options?.profileConcurrency ??
        MESSENGER_ECHO_DEFAULT_PROFILE_CONCURRENCY,
      async (contactSourceId) => {
        const profile = await ports.fetchProfile(contactSourceId)
        const finalized = finalizeContactProfile({
          locale: profile.locale,
          language: profile.language,
          timezone: profile.timezone,
        })
        return {
          sourceId: contactSourceId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          gender: profile.gender,
          locale: finalized.locale ?? undefined,
          language: finalized.language ?? undefined,
          timezone: finalized.timezone ?? undefined,
        } satisfies IncomingContact
      },
    )
    const profileBySourceId = new Map<string, IncomingContact>()
    for (const [index, result] of profileResults.entries()) {
      const contactSourceId = unknownContactSourceIds[index]
      if (result.status === "fulfilled") {
        profileBySourceId.set(result.value.sourceId, result.value)
        continue
      }
      logger.warn(
        { err: result.reason, contactSourceId, workspaceId: inbox.workspaceId },
        "Echo batch profile fetch failed; creating bare contact",
      )
    }

    const contactResult = await bulkImportChannelContacts({
      inbox,
      workspaceId: inbox.workspaceId,
      ownerId,
      contacts: contactSourceIds.map(
        (sourceId) => profileBySourceId.get(sourceId) ?? { sourceId },
      ),
    })
    summary.contactsCreated = contactResult.importedContacts

    // Plan section 6 step 4 patches before insert. This implementation must
    // insert first so contact:created includes the fetched name; only profiles
    // whose insert lost a race are patched afterward, and the repository keeps
    // an already-named winner untouched.
    const raceLoserProfiles = [...profileBySourceId.entries()].flatMap(
      ([sourceId, profile]) => {
        if (contactResult.newContactInboxIds.has(sourceId)) {
          return []
        }
        const link = contactResult.contactInboxIds.get(sourceId)
        return link
          ? [
              {
                contactId: link.contactId,
                firstName: profile.firstName,
                lastName: profile.lastName,
                gender: profile.gender,
                locale: profile.locale,
                timezone: profile.timezone,
              },
            ]
          : []
      },
    )
    if (raceLoserProfiles.length > 0) {
      await contactRepository.bulkPatchProfiles({
        workspaceId: inbox.workspaceId,
        profiles: raceLoserProfiles,
      })
    }

    const failedSourceIds = new Set<string>()
    const failItem = async (
      item: EchoBatchItem<TRaw, TAttachmentDescriptor>,
      error: unknown,
    ): Promise<void> => {
      if (failedSourceIds.has(item.sourceId)) {
        return
      }
      failedSourceIds.add(item.sourceId)
      summary.perItemFailures += 1
      logger.error(
        { err: error, sourceId: item.sourceId, workspaceId: inbox.workspaceId },
        "Echo batch item failed; falling back to the single-event path",
      )
      await ports.fallbackToSingleEvent(item, error)
    }

    const resolvedItems: ResolvedItem<TRaw, TAttachmentDescriptor>[] = []
    for (const item of items) {
      const link = contactResult.contactInboxIds.get(item.contactSourceId)
      if (!link?.conversationId) {
        await failItem(item, asError("Echo contact link could not be resolved"))
        continue
      }
      resolvedItems.push({
        item,
        ...link,
        createdAt: item.createdAt,
      })
    }

    // Keep retries inside dedup after the seven-day acceptance boundary moves.
    const { repository, rowBySourceKey, writeShardRows } =
      await findPersistedEchoMessages({
        workspaceId: inbox.workspaceId,
        items: resolvedItems.map(({ item, contactInboxId }) => ({
          contactInboxId,
          sourceId: item.sourceId,
        })),
        now,
      })
    const writeShardMessageKeys = new Set(writeShardRows.map(messageKey))
    const insertableItems = resolvedItems.filter(
      ({ item, contactInboxId }) =>
        !rowBySourceKey.has(
          messageSourceKey({ contactInboxId, sourceId: item.sourceId }),
        ),
    )
    const messageInputs: CreateMessageInput[] = insertableItems.map(
      ({ item, contactInboxId, conversationId, createdAt }) => ({
        id: createId(),
        workspaceId: inbox.workspaceId,
        conversationId,
        contactInboxId,
        sourceId: item.sourceId,
        senderType: "user",
        senderId: null,
        messageType: "outgoing",
        text: item.text,
        contentType: item.contentType,
        contentAttributes: item.contentAttributes,
        type: "message",
        parentId: null,
        createdAt,
      }),
    )

    const insertedRows =
      messageInputs.length > 0 ? await repository.bulkCreate(messageInputs) : []
    summary.messagesInserted = insertedRows.length
    summary.duplicatesSkipped =
      rowBySourceKey.size + messageInputs.length - insertedRows.length
    for (const row of insertedRows) {
      rowBySourceKey.set(messageSourceKey(row), row)
    }

    const resolvedMessages: ResolvedMessage<TRaw, TAttachmentDescriptor>[] = []
    for (const resolved of resolvedItems) {
      const row = rowBySourceKey.get(
        messageSourceKey({
          contactInboxId: resolved.contactInboxId,
          sourceId: resolved.item.sourceId,
        }),
      )
      if (!row) {
        await failItem(
          resolved.item,
          asError(
            "Echo message was neither inserted nor resolved after conflict",
          ),
        )
        continue
      }
      resolvedMessages.push({ ...resolved, message: row })
    }

    const insertedKeys = new Set(insertedRows.map(messageKey))
    const preExistingMessages = resolvedMessages.flatMap((entry) =>
      writeShardMessageKeys.has(messageKey(entry.message)) &&
      !insertedKeys.has(messageKey(entry.message))
        ? [
            {
              messageId: entry.message.id,
              messageCreatedAt: entry.message.createdAt,
            },
          ]
        : [],
    )
    // Both attachment reads and writes route to the current write shard, so
    // only messages proven to live there are eligible for repair.
    const existingAttachmentPairs =
      await repository.findAttachmentSourceIdsByMessageIds({
        workspaceId: inbox.workspaceId,
        messages: preExistingMessages,
      })
    const existingSourceIdsByMessage = new Map<string, Set<string | null>>()
    for (const {
      messageId,
      messageCreatedAt,
      sourceId,
    } of existingAttachmentPairs) {
      const key = attachmentMessageKey({ messageId, messageCreatedAt })
      const sourceIds = existingSourceIdsByMessage.get(key) ?? new Set()
      sourceIds.add(sourceId)
      existingSourceIdsByMessage.set(key, sourceIds)
    }
    const attachmentMessages = resolvedMessages.flatMap((entry) => {
      if (entry.item.attachments.length === 0) {
        return []
      }
      if (insertedKeys.has(messageKey(entry.message))) {
        return [{ entry, item: entry.item }]
      }
      if (!writeShardMessageKeys.has(messageKey(entry.message))) {
        return []
      }

      const descriptorSourceIds = new Set(
        entry.item.attachments.map((descriptor) => descriptor.sourceId),
      )
      const existingSourceIds =
        existingSourceIdsByMessage.get(
          attachmentMessageKey({
            messageId: entry.message.id,
            messageCreatedAt: entry.message.createdAt,
          }),
        ) ?? new Set()
      if (
        [...existingSourceIds].some(
          (sourceId) => sourceId === null || !descriptorSourceIds.has(sourceId),
        )
      ) {
        return []
      }

      const missingAttachments = entry.item.attachments.filter(
        (descriptor) => !existingSourceIds.has(descriptor.sourceId),
      )
      return missingAttachments.length > 0
        ? [{ entry, item: { ...entry.item, attachments: missingAttachments } }]
        : []
    })
    const attachmentDownloads = attachmentMessages.flatMap(({ entry, item }) =>
      item.attachments.map((descriptor) => ({ entry, item, descriptor })),
    )
    const downloadResults = await mapWithConcurrency(
      attachmentDownloads,
      props.options?.attachmentConcurrency ??
        MESSENGER_ECHO_DEFAULT_ATTACHMENT_CONCURRENCY,
      async ({ entry, item, descriptor }) => {
        const attachments = await ports.downloadAttachments({
          ...item,
          attachments: [descriptor],
        })
        const matchingAttachments = attachments.filter(
          (attachment) => attachment.sourceId === descriptor.sourceId,
        )
        if (
          matchingAttachments.length !== 1 ||
          attachments.length !== matchingAttachments.length
        ) {
          summary.attachmentFailures += 1
          logger.warn(
            {
              err: asError(
                "Downloaded attachments did not match their stable descriptors",
              ),
              sourceId: entry.item.sourceId,
              workspaceId: inbox.workspaceId,
            },
            "Echo batch attachment reconciliation skipped mismatched attachments",
          )
        }
        return { entry, attachments: matchingAttachments }
      },
    )
    const downloaded = [] as Array<{
      entry: ResolvedMessage<TRaw, TAttachmentDescriptor>
      attachments: IncomingAttachment[]
    }>
    for (const [index, result] of downloadResults.entries()) {
      if (result.status === "fulfilled") {
        downloaded.push(result.value)
      } else {
        const attachmentDownload = attachmentDownloads[index]
        if (attachmentDownload) {
          summary.attachmentFailures += 1
          logger.warn(
            {
              err: result.reason,
              sourceId: attachmentDownload.item.sourceId,
              workspaceId: inbox.workspaceId,
            },
            "Echo batch attachment download failed; saving message without failed attachments",
          )
        }
      }
    }

    const attachmentCandidates = downloaded.flatMap(({ entry, attachments }) =>
      attachments.map((attachment) => ({ entry, attachment })),
    )
    const seenAttachmentKeys = new Set<string>()
    const attachmentInputs = attachmentCandidates.flatMap(
      ({ entry, attachment }) => {
        const key = attachmentKey({
          messageId: entry.message.id,
          messageCreatedAt: entry.message.createdAt,
          sourceId: attachment.sourceId,
        })
        if (seenAttachmentKeys.has(key)) {
          return []
        }
        seenAttachmentKeys.add(key)
        return [
          {
            id: createId(),
            workspaceId: inbox.workspaceId,
            conversationId: entry.conversationId,
            messageId: entry.message.id,
            messageCreatedAt: entry.message.createdAt,
            sourceId: attachment.sourceId,
            fileType: attachment.fileType,
            mimeType: attachment.mimeType,
            originPath: attachment.originPath,
            size: attachment.size,
            width: attachment.width,
            height: attachment.height,
            name: attachment.name,
          },
        ]
      },
    )
    const insertedAttachments =
      attachmentInputs.length > 0
        ? await repository.bulkCreateAttachments(attachmentInputs)
        : []
    summary.attachmentsWritten = insertedAttachments.length

    const insertedMessages = resolvedMessages.filter((entry) =>
      insertedKeys.has(messageKey(entry.message)),
    )
    const trackingByContactInbox = new Map<
      string,
      {
        oldest: ResolvedMessage<TRaw, TAttachmentDescriptor>
        newest: ResolvedMessage<TRaw, TAttachmentDescriptor>
      }
    >()
    const newestByConversation = new Map<
      string,
      ResolvedMessage<TRaw, TAttachmentDescriptor>
    >()
    for (const entry of resolvedMessages) {
      const contactCurrent = trackingByContactInbox.get(entry.contactInboxId)
      trackingByContactInbox.set(entry.contactInboxId, {
        oldest:
          !contactCurrent ||
          entry.message.createdAt < contactCurrent.oldest.message.createdAt
            ? entry
            : contactCurrent.oldest,
        newest:
          !contactCurrent ||
          contactCurrent.newest.message.createdAt < entry.message.createdAt
            ? entry
            : contactCurrent.newest,
      })
      const conversationCurrent = newestByConversation.get(entry.conversationId)
      if (
        !conversationCurrent ||
        conversationCurrent.message.createdAt < entry.message.createdAt
      ) {
        newestByConversation.set(entry.conversationId, entry)
      }
    }
    await Promise.all([
      contactInboxService.bulkUpdateTracking({
        rows: [...trackingByContactInbox.values()].map(
          ({ oldest, newest }) => ({
            contactInboxId: newest.contactInboxId,
            contactId: newest.contactId,
            workspaceId: inbox.workspaceId,
            firstInteractionAt: oldest.message.createdAt,
            lastMessageAt: newest.message.createdAt,
            lastIncomingMessageAt: null,
          }),
        ),
      }),
      conversationService.bulkAdvanceActivityAndAiContextMarker({
        workspaceId: inbox.workspaceId,
        rows: [...newestByConversation.values()].map((entry) => ({
          conversationId: entry.conversationId,
          newestMessageAt: entry.message.createdAt,
          aiMarkerMessageId: null,
        })),
      }),
    ])

    const attachmentsByMessage = new Map<string, typeof insertedAttachments>()
    for (const attachment of insertedAttachments) {
      const key = attachmentMessageKey(attachment)
      const current = attachmentsByMessage.get(key) ?? []
      current.push(attachment)
      attachmentsByMessage.set(key, current)
    }
    // Realtime and the loop guard match the single path's isNew gate; unlike
    // tracking, these side effects are intentionally inserted-rows-only.
    for (const entry of insertedMessages) {
      await broadcastToWorkspaceParty(
        inbox.workspaceId,
        {
          eventType: RealtimeEventType.messageCreated,
          data: {
            ...entry.message,
            attachments:
              attachmentsByMessage.get(
                attachmentMessageKey({
                  messageId: entry.message.id,
                  messageCreatedAt: entry.message.createdAt,
                }),
              ) ?? [],
          },
        },
        realtimeTarget,
      )
    }
    const persistedTextEntries = insertedMessages.flatMap((entry) =>
      entry.item.contentType === "text" && entry.item.text
        ? [
            {
              row: entry.message as MessageModel,
              item: entry.item,
              contactInboxId: entry.contactInboxId,
              conversationId: entry.conversationId,
            },
          ]
        : [],
    )
    if (persistedTextEntries.length > 0) {
      await ports.onTextMessagesPersisted(persistedTextEntries)
    }

    return summary
  }
}

export const messengerEchoBatchService = new MessengerEchoBatchService()
