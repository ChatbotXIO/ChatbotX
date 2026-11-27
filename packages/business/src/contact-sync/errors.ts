import {
  CONTACT_SYNC_ERROR_CODES,
  type ContactSyncMappingIssueReason,
  type ContactSyncMappingKind,
} from "@chatbotx.io/database/partials"
import { ChatbotXException } from "../errors"
import type { ContactSyncAvailability } from "./availability"

/** A contact-sync refusal carrying one of `CONTACT_SYNC_ERROR_CODES`. */
export const contactSyncException = (
  code: (typeof CONTACT_SYNC_ERROR_CODES)[keyof typeof CONTACT_SYNC_ERROR_CODES],
  message: string,
  httpStatusCode = 422,
) => new ChatbotXException(message, code, httpStatusCode)

/** One mapping problem of a `saveMappings` call. */
export type ContactSyncMappingIssue = {
  kind: ContactSyncMappingKind
  externalId: string
  reason: ContactSyncMappingIssueReason
}

/**
 * Thrown when any mapping row is invalid; nothing is saved then. `data`
 * lists every refused row (`contactSyncMappingInvalidDataSchema`), so an API
 * caller can fix each one without parsing the message.
 */
export class ContactSyncMappingError extends ChatbotXException {
  readonly issues: ContactSyncMappingIssue[]

  constructor(issues: ContactSyncMappingIssue[]) {
    super(
      `Invalid mappings: ${issues
        .map((issue) => `${issue.kind} ${issue.externalId} (${issue.reason})`)
        .join(", ")}`,
      CONTACT_SYNC_ERROR_CODES.mappingInvalid,
      422,
    )
    this.issues = issues
    this.data = Object.fromEntries(
      issues.map((issue) => [
        `${issue.kind}:${issue.externalId}`,
        issue.reason,
      ]),
    )
  }
}

/** `data.runId` names the live run (`contactSyncAlreadyRunningDataSchema`). */
export const contactSyncAlreadyRunningError = (runId: string | null) => {
  const error = contactSyncException(
    CONTACT_SYNC_ERROR_CODES.alreadyRunning,
    "A contact sync is already running in this workspace",
    409,
  )
  if (runId) {
    error.data = { runId }
  }
  return error
}

/** `data.nextSyncAt` says when a sync may start (`contactSyncCooldownDataSchema`). */
export const contactSyncCooldownError = (nextSyncAt: Date | null) => {
  const error = contactSyncException(
    CONTACT_SYNC_ERROR_CODES.cooldown,
    "Contacts can be synced once every 4 hours",
    409,
  )
  error.data = { nextSyncAt: nextSyncAt?.toISOString() ?? "" }
  return error
}

/** Refuses a new run while one is live or the cooldown is not over. */
export const assertContactSyncAvailable = (
  availability: ContactSyncAvailability,
): void => {
  if (availability.blockedReason === "running") {
    throw contactSyncAlreadyRunningError(availability.activeRunId ?? null)
  }
  if (availability.blockedReason === "cooldown") {
    throw contactSyncCooldownError(availability.nextSyncAt)
  }
}
