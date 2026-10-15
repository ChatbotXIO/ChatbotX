import type {
  InboundWebhookFieldError,
  InboundWebhookSkipReason,
} from "@chatbotx.io/database/partials"
import type { InboundWebhookModel } from "@chatbotx.io/database/types"
import { mergeRichSystemFields } from "../contact/service"
import {
  applyMappedContactFields,
  toRichSystemFields,
  writableFields,
} from "./apply-mapped-fields"
import { extractInboundWebhookValues, toFieldErrors } from "./extract"
import { loadExtractionContext } from "./extraction-context"
import { type NameParts, resolveInboundWebhookContact } from "./resolve-contact"
import { resolveInboundWebhookInbox } from "./resolve-inbox"

export type ApplyInboundWebhookPayloadResult =
  | {
      status: "processed"
      inboxId: string
      contactId: string
      contactInboxId: string
      isNew: boolean
      fieldErrors: InboundWebhookFieldError[]
    }
  | {
      status: "skipped"
      reason: InboundWebhookSkipReason
      inboxId?: string
      fieldErrors: InboundWebhookFieldError[]
    }

/**
 * The name a NEW contact starts with. The full name from the contact section
 * is the base; mapped system name fields are laid over it, so an explicit
 * mapping wins and a mapped `first_name` alone keeps the base's last name.
 * Mapped fields apply in row order, later wins (as `mergeRichSystemFields`).
 */
export const buildNewContactName = (
  fullName: string | undefined,
  mappedRichFields: ReturnType<typeof toRichSystemFields>,
): NameParts => {
  const base = fullName ? mergeRichSystemFields({ full_name: fullName }) : {}
  const { firstName, lastName } = {
    ...base,
    ...mergeRichSystemFields(mappedRichFields),
  }
  return { firstName: firstName ?? undefined, lastName: lastName ?? undefined }
}

/**
 * Applies one delivered payload: resolves the inbox, finds or creates the
 * contact on it, writes the mapped fields. Safe to run again for the same
 * request — it only looks up and upserts — which is what lets the worker retry
 * and reclaim a request without duplicating anything.
 */
export const applyInboundWebhookPayload = async (input: {
  webhook: InboundWebhookModel
  payload: unknown
}): Promise<ApplyInboundWebhookPayloadResult> => {
  const { webhook, payload } = input
  const { workspaceId, inboxResolution, identifiers, fieldMappings } = webhook
  if (!inboxResolution) {
    // An incomplete config cannot be active, but an in-flight request may
    // outlive a config change.
    return { status: "skipped", reason: "webhookInactive", fieldErrors: [] }
  }

  const context = await loadExtractionContext({ workspaceId, fieldMappings })
  const extracted = await extractInboundWebhookValues({
    payload,
    inboxResolution,
    identifiers,
    fieldMappings,
    ...context,
  })
  const fieldErrors = toFieldErrors(extracted.fields)

  const resolvedInbox = await resolveInboundWebhookInbox({
    workspaceId,
    resolution: inboxResolution,
    inboxIdentifier: extracted.inboxIdentifier,
  })
  if ("skipReason" in resolvedInbox) {
    return {
      status: "skipped",
      reason: resolvedInbox.skipReason,
      fieldErrors,
    }
  }
  const { inbox } = resolvedInbox

  const writable = writableFields(extracted.fields)
  const contact = await resolveInboundWebhookContact({
    workspaceId,
    inbox,
    identities: extracted.identities,
    profile: buildNewContactName(
      extracted.identities.fullName,
      toRichSystemFields(writable),
    ),
  })
  if ("skipReason" in contact) {
    return {
      status: "skipped",
      reason: contact.skipReason,
      inboxId: inbox.id,
      fieldErrors,
    }
  }

  await applyMappedContactFields({
    workspaceId,
    contactId: contact.contactId,
    contactInboxId: contact.contactInboxId,
    fields: writable,
  })

  return {
    status: "processed",
    inboxId: inbox.id,
    contactId: contact.contactId,
    contactInboxId: contact.contactInboxId,
    isNew: contact.isNew,
    fieldErrors,
  }
}
