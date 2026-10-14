import {
  type ChannelType,
  type InboundWebhookInboxResolution,
  type InboundWebhookSkipReason,
  type IntegrationType,
  inboxStatuses,
} from "@chatbotx.io/database/partials"
import {
  connectionRepository,
  integrationWhatsappRepository,
} from "@chatbotx.io/database/repositories"
import type { InboxModel } from "@chatbotx.io/database/types"
import {
  getInboxIdentifierStrategy,
  type InboxLookupStrategy,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import { inboxService } from "../inbox/service"

type InboxLookupInput = {
  workspaceId: string
  channel: ChannelType
  value: string
}

const NON_DIGITS = /\D/g

const findInboxesByIds = async (
  workspaceId: string,
  ids: string[],
): Promise<InboxModel[]> => {
  const inboxes = await Promise.all(
    ids.map((id) => inboxService.find({ where: { id, workspaceId } })),
  )
  return inboxes.filter((inbox): inbox is InboxModel => inbox !== undefined)
}

/**
 * How each identifier kind is turned into inbox candidates. Keyed by lookup
 * strategy, never by channel: a channel only declares (in the shared registry)
 * which strategy resolves its identifier. Every lookup is workspace-scoped.
 */
const INBOX_LOOKUPS: Record<
  InboxLookupStrategy,
  (input: InboxLookupInput) => Promise<InboxModel[]>
> = {
  inboxSourceId: async ({ workspaceId, channel, value }) => {
    const inbox = await inboxService.find({
      where: { workspaceId, channel, sourceId: value },
    })
    return inbox ? [inbox] : []
  },
  // `Connection.sourceId` is the account id on every connect path, while some
  // channels (TikTok) store a different value in `Inbox.sourceId`.
  connectionSourceId: async ({ workspaceId, channel, value }) => {
    const connection = await connectionRepository.findByProviderSourceId({
      workspaceId,
      provider: channel as IntegrationType,
      sourceId: value,
    })
    return connection?.inboxId
      ? await findInboxesByIds(workspaceId, [connection.inboxId])
      : []
  },
  // The display phone is free-form and not unique, so compare digits and let
  // the caller treat several matches as ambiguous.
  whatsappDisplayPhone: async ({ workspaceId, value }) => {
    const rows = await integrationWhatsappRepository.listByDisplayPhoneDigits({
      workspaceId,
      digits: value,
    })
    return await findInboxesByIds(
      workspaceId,
      rows.map((row) => row.inboxId),
    )
  },
}

/**
 * The form a payload value takes before lookup; `""` means it carries nothing
 * usable (such as a phone "N/A"), which is a missing identifier, not an
 * unknown inbox.
 */
const LOOKUP_VALUES: Record<InboxLookupStrategy, (value: string) => string> = {
  inboxSourceId: (value) => value,
  connectionSourceId: (value) => value,
  whatsappDisplayPhone: (value) => value.replace(NON_DIGITS, ""),
}

export type ResolvedInboundWebhookInbox =
  | { inbox: InboxModel }
  | { skipReason: InboundWebhookSkipReason }

const pickConnectedInbox = (
  candidates: InboxModel[],
): ResolvedInboundWebhookInbox => {
  if (candidates.length === 0) {
    return { skipReason: "inboxNotFound" }
  }
  if (candidates.length > 1) {
    return { skipReason: "inboxAmbiguous" }
  }
  const [inbox] = candidates
  return inbox.status === inboxStatuses.enum.connected
    ? { inbox }
    : { skipReason: "inboxDisconnected" }
}

/**
 * The inbox a request targets. `inboxIdentifier` is the value already read from
 * the payload (only used in `payload` mode). A value that is present but
 * matches nothing is `inboxNotFound`; a path that yielded nothing is
 * `missingInboxIdentifier` — they point the owner at different fixes.
 */
export const resolveInboundWebhookInbox = async (input: {
  workspaceId: string
  resolution: InboundWebhookInboxResolution
  inboxIdentifier: string | null
}): Promise<ResolvedInboundWebhookInbox> => {
  const { workspaceId, resolution, inboxIdentifier } = input
  if (resolution.mode === "inbox") {
    return pickConnectedInbox(
      await findInboxesByIds(workspaceId, [resolution.inboxId]),
    )
  }
  if (!inboxIdentifier) {
    return { skipReason: "missingInboxIdentifier" }
  }
  const strategy = getInboxIdentifierStrategy(
    resolution.channel,
    resolution.identifierKind,
  )
  if (!strategy) {
    return { skipReason: "inboxNotFound" }
  }
  const value = LOOKUP_VALUES[strategy](inboxIdentifier)
  if (!value) {
    return { skipReason: "missingInboxIdentifier" }
  }
  return pickConnectedInbox(
    await INBOX_LOOKUPS[strategy]({
      workspaceId,
      channel: resolution.channel,
      value,
    }),
  )
}
