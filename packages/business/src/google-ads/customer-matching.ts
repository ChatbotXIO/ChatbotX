import type {
  GoogleAdsMatchingSnapshot,
  GoogleAdsUploadMethod,
} from "@chatbotx.io/database/partials"
import { contactInboxRepository } from "@chatbotx.io/database/repositories"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { isGoogleAdsMatchTemplate } from "@chatbotx.io/utils/google-click"
import {
  type HashedMatchingIdentifiers,
  hashMatchingIdentifiers,
  type MatchingValues,
} from "./hash-user-data"

/**
 * Customer matching: the contact's e-mail and phone, hashed, sent as Data
 * Manager `userData`. The recorded event keeps only the CONFIGURATION (the
 * `{{variable}}` of each identifier); the values are resolved from the contact
 * and hashed again at every delivery attempt, so nothing personal (raw or
 * hashed) is ever stored on the event.
 */

type MatchingConfig = {
  matchEmail?: string
  matchPhone?: string
}

type SnapshotInput = MatchingConfig & {
  /** Recorded `adUserData` consent: only an explicit `granted` allows identifiers. */
  adUserDataStatus: "granted" | "denied" | null
  /** The event's pinned transport; only Data Manager carries customer matching. */
  uploadMethod: GoogleAdsUploadMethod
}

/**
 * A saved step can predate the current rules (a stale literal, an over-long
 * template): anything that is not exactly one variable counts as not
 * configured, so it is never resolved, hashed or recorded.
 */
const templateOrNull = (template: string | undefined): string | null => {
  const trimmed = template?.trim()
  return trimmed && isGoogleAdsMatchTemplate(trimmed) ? trimmed : null
}

/** `undefined` when the step configures no identifier: the event stays click-only, as before. */
export const buildMatchingSnapshot = (
  input: SnapshotInput,
): GoogleAdsMatchingSnapshot | undefined => {
  const email = templateOrNull(input.matchEmail)
  const phone = templateOrNull(input.matchPhone)
  if (!(email || phone)) {
    return
  }
  if (input.uploadMethod !== "dataManager") {
    return { status: "unsupportedTransport", email, phone }
  }
  return {
    status:
      input.adUserDataStatus === "granted" ? "enabled" : "withheldConsent",
    email,
    phone,
  }
}

/**
 * Replaces the `{{variable}}` of each configured identifier with the contact's
 * current value. Supplied by the worker (the variable engine depends on this
 * package, so it cannot be imported here).
 */
export type MatchingTemplateResolver = (input: {
  contactId: string
  contactInbox: ContactInboxModel
  templates: { email: string | null; phone: string | null }
}) => Promise<MatchingValues>

type DeliveryEvent = {
  workspaceId: string
  contactInboxId: string | null
}

/**
 * The hashed identifiers for one delivery attempt, from the CURRENT contact of
 * the event's contact inbox (scoped to its workspace). A deleted contact, a
 * cleared field or an invalid value yields fewer identifiers, down to none: the
 * conversion is still sent by click. `undefined` when there is nothing to send,
 * which includes every recorded status other than `enabled`.
 */
export const loadMatchingIdentifiers = async (
  event: DeliveryEvent,
  matching: GoogleAdsMatchingSnapshot | undefined,
  resolveTemplates: MatchingTemplateResolver | undefined,
): Promise<HashedMatchingIdentifiers | undefined> => {
  if (
    matching?.status !== "enabled" ||
    !event.contactInboxId ||
    !resolveTemplates
  ) {
    return
  }
  const contactInbox = await contactInboxRepository.findModelByIdForWorkspace({
    id: event.contactInboxId,
    workspaceId: event.workspaceId,
  })
  if (!contactInbox) {
    return
  }
  const values = await resolveTemplates({
    contactId: contactInbox.contactId,
    contactInbox,
    templates: { email: matching.email, phone: matching.phone },
  })
  const hashed = await hashMatchingIdentifiers(values)
  return Object.keys(hashed).length > 0 ? hashed : undefined
}
