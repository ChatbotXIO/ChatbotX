import {
  type ContactProfileFetcher,
  type ContactProfileName,
  type ContactProfileNameSource,
  contactProfileRefreshService,
  hasEmptyProfileName,
  resolveInboundProfileNameSource,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { ContactInboxModel, InboxModel } from "@chatbotx.io/database/types"
import type { IncomingContact, IncomingMessage } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import { resolveIntegrationContextFromContactInbox } from "../../services/integrations"

export type ProfileRefreshCandidate = {
  channel: ChannelType
  incomingMessage: IncomingMessage
  contact: ContactProfileName
}

// "Real inbound" = not an echo/outgoing send, and not a non-message row
// (e.g. an `activity` reaction row) — owned here so received-message.ts's
// `getMessageActivityTracking` can import it back and mean the same thing.
export const isInboundConversationMessage = (
  incomingMessage: IncomingMessage,
): boolean =>
  incomingMessage.messageType !== "outgoing" &&
  (incomingMessage.type ?? "message") === "message"

/**
 * The channel/message/contact eligibility gate, collapsed to the source the
 * caller needs: `null` when any check fails, otherwise the source to fetch
 * with. Order matches the old rule table — capability, then real-inbound,
 * then name-empty.
 */
export const getProfileRefreshSource = (
  candidate: ProfileRefreshCandidate,
): ContactProfileNameSource | null => {
  const source = resolveInboundProfileNameSource(candidate.channel)
  if (
    !(
      source &&
      isInboundConversationMessage(candidate.incomingMessage) &&
      hasEmptyProfileName(candidate.contact)
    )
  ) {
    return null
  }
  return source
}

type InboundFetcherDeps = {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  incomingContact: IncomingContact
}

// Name-related fields only. `locale`/`timezone`/`gender` are deliberately
// NOT forwarded here even when the webhook payload carries them: those
// columns are only trustworthy once `finalizeContactProfile` has normalized
// them at contact-creation time (locale normalization, phone-derived
// timezone), and a later inbound message must never clobber that finalized
// value with the raw, unnormalized payload value.
const PAYLOAD_NAME_FIELDS = [
  "firstName",
  "lastName",
  "avatar",
] as const satisfies readonly (keyof IncomingContact)[]

const pickPayloadNameFields = (
  incomingContact: IncomingContact,
): IncomingContact => {
  const picked: IncomingContact = { sourceId: incomingContact.sourceId }
  for (const field of PAYLOAD_NAME_FIELDS) {
    const value = incomingContact[field]
    if (value !== undefined) {
      picked[field] = value
    }
  }
  return picked
}

// Strategy table keyed by `ContactProfileNameSource` — exhaustive via
// `Record`, so adding a source is one row, never a branch.
const inboundProfileFetchers: Record<
  ContactProfileNameSource,
  (deps: InboundFetcherDeps) => ContactProfileFetcher
> = {
  // What the channel already parsed from the webhook — no network call.
  // Filtered to name-related fields only; see `pickPayloadNameFields`.
  payload:
    ({ incomingContact }) =>
    () =>
      Promise.resolve(pickPayloadNameFields(incomingContact)),
  // Lazy: integration resolution (and the Graph call itself) only happens
  // when this callback runs, so a missing/disconnected integration surfaces
  // inside `contactProfileRefreshService.refresh` as `failed` + cooldown
  // instead of throwing before the service can decide anything.
  channelApi:
    ({ inbox, contactInbox }) =>
    async () => {
      const { integration, ctx } =
        await resolveIntegrationContextFromContactInbox({
          workspaceId: inbox.workspaceId,
          contactInbox,
        })
      return integration.runChannelHandler("contact", "getProfile", {
        ctx,
        data: { sourceId: contactInbox.sourceId },
      })
    },
}

export type RefreshExistingContactProfileInput = {
  source: ContactProfileNameSource
  inbox: InboxModel
  contactInbox: ContactInboxModel
  incomingContact: IncomingContact
  contactId: string
}

/**
 * Best-effort refresh of a nameless existing contact's profile after an
 * inbound message has been persisted. Never throws — every failure path
 * (including an unexpected one from the service itself) is caught and
 * logged so the receive job can never be rejected by profile work (owner
 * mandate). The outcome is logged at `debug`.
 */
export const refreshExistingContactProfile = async (
  input: RefreshExistingContactProfileInput,
): Promise<void> => {
  const { source, inbox, contactInbox, incomingContact, contactId } = input

  try {
    const fetchProfile = inboundProfileFetchers[source]({
      inbox,
      contactInbox,
      incomingContact,
    })
    const result = await contactProfileRefreshService.refresh({
      workspaceId: inbox.workspaceId,
      contactId,
      contactInbox,
      source,
      fetchProfile,
    })
    logger.debug(
      { result, contactId, channel: inbox.channel },
      "refreshExistingContactProfile: result",
    )
  } catch (error) {
    logger.warn(
      { error, contactId, channel: inbox.channel },
      "refreshExistingContactProfile: unexpected error",
    )
  }
}
