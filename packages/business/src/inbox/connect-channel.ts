import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  INSTAGRAM_IG_ID_UNIQUE_CONSTRAINT,
  MESSENGER_PAGE_ID_UNIQUE_CONSTRAINT,
  WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT,
} from "@chatbotx.io/database/schema"
import { dispatchAuditRecordSafely } from "../audit/dispatcher"
import { channelDuplicatedException } from "../errors"

/** Per-channel data the shared connect helpers need; a new channel adds a row, not a function. */
const CHANNEL_CONNECT_DESCRIPTORS = {
  messenger: {
    duplicateConstraint: MESSENGER_PAGE_ID_UNIQUE_CONSTRAINT,
    auditNoun: "Messenger",
  },
  instagram: {
    duplicateConstraint: INSTAGRAM_IG_ID_UNIQUE_CONSTRAINT,
    auditNoun: "Instagram",
  },
  whatsapp: {
    duplicateConstraint: WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT,
    auditNoun: "WhatsApp",
  },
} as const satisfies Partial<
  Record<ChannelType, { duplicateConstraint: string; auditNoun: string }>
>

type ConnectDescriptorChannel = keyof typeof CHANNEL_CONNECT_DESCRIPTORS

/**
 * `db.transaction` + "the channel's identity constraint fired →
 * channelDuplicatedException" mapping shared by every channel's connect flow.
 */
export async function runConnectTransaction<T>(
  channel: ConnectDescriptorChannel,
  body: (tx: DatabaseClient) => Promise<T>,
): Promise<T> {
  const { duplicateConstraint } = CHANNEL_CONNECT_DESCRIPTORS[channel]

  try {
    return await db.transaction(body)
  } catch (error) {
    if (isUniqueViolationError(error, duplicateConstraint)) {
      throw channelDuplicatedException()
    }
    throw error
  }
}

/**
 * The standard post-commit "connected a new <Channel> channel (#id)" audit;
 * logs on failure, never throws (the underlying write already committed).
 */
export async function auditChannelConnected(props: {
  channel: ConnectDescriptorChannel
  actorUserId: string
  workspaceId: string
  integrationId: string
}): Promise<void> {
  const { auditNoun } = CHANNEL_CONNECT_DESCRIPTORS[props.channel]

  await dispatchAuditRecordSafely(
    {
      userId: props.actorUserId,
      workspaceId: props.workspaceId,
      action: "connect",
      detail: `connected a new ${auditNoun} channel (#${props.integrationId})`,
    },
    `audit dispatch failed after ${auditNoun} connect`,
  )
}
