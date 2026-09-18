import { contactInboxService } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import { shouldAddressBySourceUserId } from "@chatbotx.io/sdk"
import { parsePhoneNumberFromString } from "libphonenumber-js"

const digitsOf = (phoneNumber: string): string => phoneNumber.replace(/\D/g, "")

/**
 * Resolves the business number's calling country via a real libphonenumber
 * region parse (not a `+1`/`+84` prefix heuristic, which would wrongly block
 * every NANP number for a `+1` check). Resolves to `undefined` when the
 * number cannot be parsed, so the caller fails open on it.
 */
const resolveBusinessCallingCountry = (
  displayPhoneNumber: string,
): string | undefined => parsePhoneNumberFromString(displayPhoneNumber)?.country

/**
 * Resolves the WhatsApp `ContactInbox` for this conversation's contact,
 * optionally pinned to a specific one via `contactInboxId` — mirrors
 * `resolveContactInbox` in `start-call.action.ts`.
 */
export async function resolveContactInbox(input: {
  contactId: string
  contactInboxId?: string
}): Promise<{
  id: string
  inboxId: string
  channel: string
  sourceId: string
  /**
   * The Business-Scoped User ID (BSUID) for a Username/BSUID-only
   * contact — present alongside an empty `sourceId` when the contact's phone
   * number was never exposed. Feeds `shouldAddressBySourceUserId` below to
   * decide `to` vs `recipient` on the outbound `connect`.
   */
  sourceUserId: string | null
  /** Per-channel language (the contact panel's "Language" field) — feeds the
   * announcement-language resolution below. */
  language: string | null
} | null> {
  const contactInbox = input.contactInboxId
    ? await contactInboxService.findBy({
        where: {
          id: input.contactInboxId,
          contactId: input.contactId,
          channel: channelTypes.enum.whatsapp,
        },
      })
    : await contactInboxService.findBy({
        where: {
          contactId: input.contactId,
          channel: channelTypes.enum.whatsapp,
        },
      })
  if (!contactInbox) {
    return null
  }
  return {
    id: contactInbox.id,
    inboxId: contactInbox.inboxId,
    channel: contactInbox.channel,
    sourceId: contactInbox.sourceId,
    sourceUserId: contactInbox.sourceUserId,
    language: contactInbox.language,
  }
}

export type OutboundDialContactInbox = NonNullable<
  Awaited<ReturnType<typeof resolveContactInbox>>
>

/**
 * How Meta must address this contact on the outbound `connect` and on the
 * call-permissions lookup. A Username/BSUID-only contact has no phone number,
 * so it is addressed by `recipient` (never digit-stripped — that would
 * corrupt a BSUID); everyone else by `to` plus `user_wa_id`.
 */
export function resolveDialIdentity(
  contactInbox: Pick<OutboundDialContactInbox, "sourceId" | "sourceUserId">,
): {
  to?: string
  recipient?: string
  permissionTarget: { recipient: string } | { userWaId: string }
} {
  if (
    shouldAddressBySourceUserId({
      sourceId: contactInbox.sourceId,
      sourceUserId: contactInbox.sourceUserId,
    })
  ) {
    const recipient = contactInbox.sourceUserId ?? ""
    return { recipient, permissionTarget: { recipient } }
  }
  const to = digitsOf(contactInbox.sourceId)
  return { to, permissionTarget: { userWaId: to } }
}

/** True when the business number's own country may not place outbound calls. */
export function isBlockedBusinessCallingCountry(
  displayPhoneNumber: string,
  blockedCountries: ReadonlySet<string>,
): boolean {
  const country = resolveBusinessCallingCountry(displayPhoneNumber)
  return country !== undefined && blockedCountries.has(country)
}
