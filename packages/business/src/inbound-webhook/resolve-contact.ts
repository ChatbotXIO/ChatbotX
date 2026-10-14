import { isUniqueViolationError } from "@chatbotx.io/database/client"
import {
  type ChannelType,
  contactSources,
  type InboundWebhookSkipReason,
} from "@chatbotx.io/database/partials"
import { contactInboxRepository } from "@chatbotx.io/database/repositories"
import { CONTACT_INBOX_SOURCE_ID_KEY } from "@chatbotx.io/database/schema"
import type { InboxModel } from "@chatbotx.io/database/types"
import { distributedLock } from "@chatbotx.io/redis"
import {
  CONTACT_LOOKUP_ORDER,
  type ContactIdentityKind,
  INBOUND_WEBHOOK_CHANNEL_SPECS,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import {
  type ContactInboxIdentities,
  type ContactLookupKey,
  deriveContactInboxSourceId,
  identityValue,
  normalizeContactInboxSourceId,
  selectContactLookup,
} from "../contact/contact-inbox-identity"
import {
  CONTACT_ALREADY_ON_INBOX_MESSAGE,
  createContactWithInbox,
} from "../contact/create-with-inbox"
import { contactInboxService } from "../contact-inbox/service"
import { ChatbotXException } from "../errors"

const CREATE_LOCK_TIMEOUT_SECONDS = 15

/** The name a new contact is created with. */
export type NameParts = { firstName?: string; lastName?: string }

export type ResolvedInboundWebhookContact =
  | { contactId: string; contactInboxId: string; isNew: boolean }
  | { skipReason: InboundWebhookSkipReason }

type ExistingContact = { contactId: string; contactInboxId: string }

/** `ambiguous`: two different contacts match the key (only a name can). */
type LookupOutcome = ExistingContact | "ambiguous" | null

type LookupScope = { workspaceId: string; inbox: InboxModel }

const findBySourceId = async (
  { workspaceId, inbox }: LookupScope,
  sourceId: string | null,
): Promise<ExistingContact | null> => {
  if (!sourceId) {
    return null
  }
  const found = await contactInboxService.findLatestBySource({
    inboxId: inbox.id,
    sourceId,
    workspaceId,
  })
  return found ? { contactId: found.contactId, contactInboxId: found.id } : null
}

/** By connection id where the channel derives it from this identity, else by profile field. */
const findBySourceIdOrProfile = async (
  scope: LookupScope,
  identity: ContactInboxIdentities,
  field: "phoneNumber" | "email",
  value: string,
): Promise<ExistingContact | null> => {
  const sourceId = deriveContactInboxSourceId(
    scope.inbox.channel as ChannelType,
    identity,
  )
  return sourceId
    ? await findBySourceId(scope, sourceId)
    : await contactInboxRepository.findLatestByInboxAndContactIdentity({
        workspaceId: scope.workspaceId,
        inboxId: scope.inbox.id,
        field,
        value,
      })
}

/**
 * How each identity finds a contact. Every lookup is scoped to the resolved
 * inbox — identity is never merged across channels, so a contact with the same
 * phone on another channel is a different contact, as it is for an incoming
 * message. Where the channel keys its contacts by that identity (a PSID,
 * `wa_id`, an SMTP address) the lookup is by connection id and a miss means
 * there is no such contact; otherwise it matches the contact's profile.
 */
const CONTACT_LOOKUPS: Record<
  ContactIdentityKind,
  (scope: LookupScope, value: string) => Promise<LookupOutcome>
> = {
  channelUserId: (scope, value) =>
    findBySourceId(
      scope,
      normalizeContactInboxSourceId(scope.inbox.channel as ChannelType, value),
    ),
  phone: (scope, value) =>
    findBySourceIdOrProfile(scope, { phoneE164: value }, "phoneNumber", value),
  email: (scope, value) =>
    findBySourceIdOrProfile(scope, { email: value }, "email", value),
  fullName: async (scope, value) => {
    const [first, second] = await contactInboxRepository.findByInboxAndFullName(
      {
        workspaceId: scope.workspaceId,
        inboxId: scope.inbox.id,
        fullName: value,
      },
    )
    return second ? "ambiguous" : (first ?? null)
  },
}

/** The contact the payload's first usable identity names on THIS inbox. */
const findExistingContact = (
  scope: LookupScope,
  lookup: ContactLookupKey,
): Promise<LookupOutcome> => CONTACT_LOOKUPS[lookup.kind](scope, lookup.value)

/**
 * A contact is created from an identity the channel can address (a PSID, a
 * phone for WhatsApp…); a name or an unrelated email cannot start a
 * conversation on its own.
 */
const hasCreationIdentity = (
  channel: ChannelType,
  identities: ContactInboxIdentities,
): boolean =>
  INBOUND_WEBHOOK_CHANNEL_SPECS[channel].creationIdentities.some((kind) =>
    Boolean(identityValue(identities, kind)),
  )

/**
 * The contact that already owns what a new contact would be created with. It
 * can differ from the one the lookup identity named: a WhatsApp request led by
 * a `wa_id` that is not on the inbox may carry a phone whose digits are, and a
 * webchat request led by an unknown visitor id may carry a phone or email the
 * inbox already knows. That contact IS the one the payload names, so it is
 * returned instead of creating a duplicate or failing on the unique source id.
 * This is the one deliberate exception to "a miss never falls through": it only
 * ever uses the first creation identity the payload carries.
 */
const findCreationOwner = (
  scope: LookupScope,
  identities: ContactInboxIdentities,
): Promise<LookupOutcome> => {
  const channel = scope.inbox.channel as ChannelType
  const sourceId = deriveContactInboxSourceId(channel, identities)
  if (sourceId) {
    return findBySourceId(scope, sourceId)
  }
  // Only the first creation identity the payload carries, as for the lookup:
  // matching phone OR email would let a phone-first request fall through to
  // someone else's email.
  const { creationIdentities } = INBOUND_WEBHOOK_CHANNEL_SPECS[channel]
  const kind = CONTACT_LOOKUP_ORDER.find(
    (candidate) =>
      creationIdentities.includes(candidate) &&
      identityValue(identities, candidate),
  )
  const value = kind && identityValue(identities, kind)
  return kind && value
    ? CONTACT_LOOKUPS[kind](scope, value)
    : Promise.resolve(null)
}

/** Another creator (an incoming message, the API) won the race for this identity. */
const isIdentityRace = (error: unknown): boolean =>
  isUniqueViolationError(error, CONTACT_INBOX_SOURCE_ID_KEY) ||
  (error instanceof ChatbotXException &&
    error.message === CONTACT_ALREADY_ON_INBOX_MESSAGE)

const createContact = async (input: {
  scope: LookupScope
  lookup: ContactLookupKey
  identities: ContactInboxIdentities
  profile: NameParts
}): Promise<ResolvedInboundWebhookContact> => {
  const { scope, lookup, identities, profile } = input
  const { workspaceId, inbox } = scope
  try {
    const { contact, contactInbox } = await createContactWithInbox({
      workspaceId,
      source: contactSources.enum.inboundWebhook,
      phoneUniqueness: "inbox",
      input: {
        inboxId: inbox.id,
        channel: inbox.channel as ChannelType,
        contactId: identities.channelUserId,
        phoneNumber: identities.phoneE164,
        email: identities.email ?? "",
        gender: "unknown",
        ...profile,
      },
    })
    return {
      contactId: contact.id,
      contactInboxId: contactInbox.id,
      isNew: true,
    }
  } catch (error) {
    if (!isIdentityRace(error)) {
      throw error
    }
    const winner =
      (await findCreationOwner(scope, identities)) ??
      (await findExistingContact(scope, lookup))
    if (!winner || winner === "ambiguous") {
      throw error
    }
    return { ...winner, isNew: false }
  }
}

/**
 * Finds the contact on the resolved inbox or creates it (Contact + ContactInbox
 * + Conversation). The contact is searched by ONE identity — the first the
 * payload supplied, in lookup order — and only that. Creation needs an identity
 * the channel can address; without one the request is skipped. It runs under a
 * per-inbox lock with a re-check, so two deliveries for the same new person
 * produce one contact; creators outside the lock are covered by the race
 * handling in `createContact`.
 */
export const resolveInboundWebhookContact = async (input: {
  workspaceId: string
  inbox: InboxModel
  identities: ContactInboxIdentities
  profile: NameParts
}): Promise<ResolvedInboundWebhookContact> => {
  const { workspaceId, inbox, identities, profile } = input
  const lookup = selectContactLookup(identities, inbox.channel as ChannelType)
  if (!lookup) {
    return { skipReason: "missingIdentifier" }
  }
  const scope: LookupScope = { workspaceId, inbox }

  const existing = await findExistingContact(scope, lookup)
  if (existing === "ambiguous") {
    return { skipReason: "contactAmbiguous" }
  }
  if (existing) {
    return { ...existing, isNew: false }
  }
  if (!hasCreationIdentity(inbox.channel as ChannelType, identities)) {
    return { skipReason: "contactNotFound" }
  }

  return await distributedLock.runExclusive({
    key: `inbound-webhook-contact-create-${workspaceId}-${inbox.id}`,
    timeoutInSeconds: CREATE_LOCK_TIMEOUT_SECONDS,
    retryTimeoutInSeconds: CREATE_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      const raced =
        (await findExistingContact(scope, lookup)) ??
        (await findCreationOwner(scope, identities))
      if (raced === "ambiguous") {
        return { skipReason: "contactAmbiguous" }
      }
      return raced
        ? { ...raced, isNew: false }
        : await createContact({ scope, lookup, identities, profile })
    },
  })
}
