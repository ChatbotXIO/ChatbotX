import { and, db, eq } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import { emitContactInfoChangeEvents } from "./contact-info-changes"
import { extractContactInfo } from "./extract-contact"

export type UpdateContactFromMessageProps = {
  contactId: string
  workspaceId: string
  text: string | null | undefined
  /**
   * Pre-resolved default country for the libphonenumber extractor. When
   * omitted the helper performs a workspace lookup to read
   * `Workspace.targetCountry`. Callers that already have the workspace row in
   * hand (e.g. the live webhook handler) should pass this through to avoid an
   * extra DB round trip per inbound message.
   */
  defaultCountry?: string | null
}

export type UpdateContactFromMessageResult = {
  phoneNumber?: string
  email?: string
}

/** Minimum text length worth running through the extractor. Matches the
 *  internal guard in `extractContactInfo`; short-circuit here too so we skip
 *  the workspace lookup entirely on every "ok", "hi", emoji-only ping. */
const MIN_EXTRACT_LENGTH = 5

/**
 * Scan inbound message text for phone/email and overwrite the Contact row
 * unconditionally when extraction succeeds — the customer just typed the value
 * so it represents fresher truth than any prior column value.
 *
 * Channel-agnostic: invoked for every inbound text message across all
 * channels (Messenger, WhatsApp, Telegram, Zalo, webchat, …). Callers are
 * expected to gate on `messageType !== 'outgoing'` so bot/agent-authored
 * text never feeds the extractor (otherwise long IDs in templated text could
 * false-positive into a phone overwrite). No-ops on empty / very short text.
 */
export const updateContactFromMessage = async (
  props: UpdateContactFromMessageProps,
): Promise<UpdateContactFromMessageResult> => {
  const { contactId, workspaceId, text, defaultCountry } = props
  if (!text || text.length < MIN_EXTRACT_LENGTH) {
    return {}
  }

  let country = defaultCountry ?? null
  if (defaultCountry === undefined) {
    const workspace = await db.query.workspaceModel.findFirst({
      where: { id: workspaceId },
      columns: { targetCountry: true },
    })
    country = workspace?.targetCountry ?? null
  }

  const extracted = extractContactInfo(text, country)

  const updates: { phoneNumber?: string; email?: string } = {}
  if (extracted.phoneNumber) {
    updates.phoneNumber = extracted.phoneNumber
  }
  if (extracted.email) {
    updates.email = extracted.email
  }

  if (Object.keys(updates).length > 0) {
    // Read the current values only on extraction hits (rare relative to
    // message volume) so `contactInfoUpdated` events carry the old value and
    // fire only on real changes — the no-match fast path stays query-free.
    const current = await db.query.contactModel.findFirst({
      where: { id: contactId, workspaceId },
      columns: { phoneNumber: true, email: true },
    })

    // Tenant-scoped WHERE: contactId is globally unique today but defence in
    // depth — every multi-tenant write in this codebase pairs the row id with
    // the workspaceId so a stale/spoofed contactId can never bleed across
    // workspaces.
    await db
      .update(contactModel)
      .set(updates)
      .where(
        and(
          eq(contactModel.id, contactId),
          eq(contactModel.workspaceId, workspaceId),
        ),
      )

    if (current) {
      await emitContactInfoChangeEvents(workspaceId, contactId, current, {
        phoneNumber: updates.phoneNumber ?? current.phoneNumber,
        email: updates.email ?? current.email,
      })
    }
  }

  return extracted
}
