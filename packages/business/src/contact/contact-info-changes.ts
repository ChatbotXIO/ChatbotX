import type { ContactInfoType } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import { emitContactInfoUpdated } from "@chatbotx.io/events"

export type ContactInfoSnapshot = Pick<ContactModel, "phoneNumber" | "email">

export type ContactInfoChange = {
  infoType: ContactInfoType
  oldValue: string | null
  newValue: string
}

const CONTACT_INFO_SOURCES = [
  { infoType: "phone", column: "phoneNumber" },
  { infoType: "email", column: "email" },
] as const satisfies ReadonlyArray<{
  infoType: ContactInfoType
  column: keyof ContactInfoSnapshot
}>

const normalizeContactInfoValue = (
  value: string | null | undefined,
): string | null => value?.trim() || null

/**
 * Diffs the contact-info columns between two contact snapshots. Only fields
 * that gained or changed to a non-empty value count as updated — clearing a
 * value is not a `contactInfoUpdated` event.
 */
export function collectContactInfoChanges(
  before: ContactInfoSnapshot,
  after: ContactInfoSnapshot,
): ContactInfoChange[] {
  const changes: ContactInfoChange[] = []

  for (const { infoType, column } of CONTACT_INFO_SOURCES) {
    const oldValue = normalizeContactInfoValue(before[column])
    const newValue = normalizeContactInfoValue(after[column])

    if (newValue && newValue !== oldValue) {
      changes.push({ infoType, oldValue, newValue })
    }
  }

  return changes
}

/**
 * Emits one `contactInfoUpdated` event per phone/email value that changed
 * between two contact snapshots. Emitters swallow and log their own failures,
 * so callers on hot write paths can await this without extra error handling.
 */
export async function emitContactInfoChangeEvents(
  workspaceId: string,
  contactId: string,
  before: ContactInfoSnapshot,
  after: ContactInfoSnapshot,
): Promise<void> {
  const changes = collectContactInfoChanges(before, after)
  await Promise.all(
    changes.map(({ infoType, oldValue, newValue }) =>
      emitContactInfoUpdated(
        workspaceId,
        contactId,
        infoType,
        oldValue,
        newValue,
      ),
    ),
  )
}
