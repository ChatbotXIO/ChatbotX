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
// (e.g. an `activity` reaction row) — owned here (not received-message.ts)
// so this module's eligibility rule table below doesn't have to import from
// received-message.ts, which itself imports this module's
// `refreshExistingContactProfile`/`shouldRefreshContactProfile` (that cycle
// used to only work because the binding was resolved lazily at call time).
// received-message.ts imports this back for its own
// `getMessageActivityTracking` so "inbound" means the same thing everywhere.
export const isInboundConversationMessage = (
  incomingMessage: IncomingMessage,
): boolean =>
  incomingMessage.messageType !== "outgoing" &&
  (incomingMessage.type ?? "message") === "message"

// Declarative rule table — every branch is a single-purpose predicate over
// values already in scope; adding/removing a rule never touches call sites.
const profileRefreshRules: ReadonlyArray<
  (candidate: ProfileRefreshCandidate) => boolean
> = [
  // The capability table says this channel can source a name at all.
  (candidate) => resolveInboundProfileNameSource(candidate.channel) !== null,
  // A real inbound message — not an echo/outgoing send, not an activity row.
  (candidate) => isInboundConversationMessage(candidate.incomingMessage),
  // Both firstName and lastName are blank.
  (candidate) => hasEmptyProfileName(candidate.contact),
]

export const shouldRefreshContactProfile = (
  candidate: ProfileRefreshCandidate,
): boolean => profileRefreshRules.every((rule) => rule(candidate))

type InboundFetcherDeps = {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  incomingContact: IncomingContact
}

// Strategy table keyed by `ContactProfileNameSource` — exhaustive via
// `Record`, so adding a source is one row, never a branch.
const inboundProfileFetchers: Record<
  ContactProfileNameSource,
  (deps: InboundFetcherDeps) => ContactProfileFetcher
> = {
  // What the channel already parsed from the webhook — no network call.
  payload:
    ({ incomingContact }) =>
    () =>
      Promise.resolve(incomingContact),
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
  const { inbox, contactInbox, incomingContact, contactId } = input
  const source = resolveInboundProfileNameSource(inbox.channel as ChannelType)
  // Unreachable when the caller gates on `shouldRefreshContactProfile`
  // first (it checks the same table row) — kept for type safety and as a
  // last line of defence against a direct call.
  if (!source) {
    return
  }

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
