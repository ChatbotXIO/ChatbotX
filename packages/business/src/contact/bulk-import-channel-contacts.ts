import type { InboxModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import type { IncomingContact } from "@chatbotx.io/sdk"
import { coexistImportService } from "../coexist-import/service"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceUsageService } from "../workspace-usage/service"

export type ChannelContactImportLink = {
  contactInboxId: string
  contactId: string
  conversationId: string
}

export type BulkImportChannelContactsResult = {
  importedContacts: number
  skippedContacts: number
  /** sourceId → resolved link (existing or newly inserted). */
  contactInboxIds: Map<string, ChannelContactImportLink>
  /**
   * sourceId → resolved link, narrowed to only the contacts that were newly
   * INSERTED by this call (a subset of `contactInboxIds`, derived from the
   * same `newContactCreatedEvents` used for the post-commit event emission
   * below). Added for the Automatic Customer Scan engine, which enqueues an
   * avatar-backfill job only for genuinely new contacts instead of every
   * resolved link on the page — additive; existing callers that only read
   * `contactInboxIds` are unaffected.
   */
  newContactInboxIds: Map<string, ChannelContactImportLink>
  /** Non-throw failure (e.g. workspace contact cap hit). */
  failureReason?: string
}

/**
 * Phase 1 of Coexist historical sync / Automatic Customer Scan: dedup
 * contacts by sourceId, resolve existing ContactInbox rows, and bulk-insert
 * new Contact/ContactInbox/Conversation rows. Bulk imports create contact
 * records only; MAC is counted later when a real interaction occurs.
 *
 * Race-safe via `onConflictDoNothing` + post-insert re-select for losers, with
 * orphan Contact cleanup (delegated to `coexistImportService.resolveOrCreateContactLinks`).
 * Idempotent — re-running with the same batch returns the existing links
 * without creating duplicates.
 *
 * Returns one `ChannelContactImportLink` per dedup'd sourceId (existing + newly
 * created). Callers use this map to dispatch downstream avatar / message
 * fetches without an additional DB lookup.
 *
 * Moved verbatim from `apps/worker/src/integration/handlers/coexist/bulk-historical-import.ts`'s
 * `bulkImportContacts` (Phase 4a of the Automatic Customer Scan plan) — only
 * the logger import changed, from the worker's child logger to this
 * package's `../logger`. `bulk-historical-import.ts` keeps a re-export shim
 * (`bulkImportContacts`) so its coexist callers are unaffected.
 */
export const bulkImportChannelContacts = async (props: {
  inbox: Pick<InboxModel, "id" | "channel">
  workspaceId: string
  contacts: IncomingContact[]
  /** Opt-in owner/pool quota accounting for passive contacts created by live ingestion. */
  ownerId?: string
}): Promise<BulkImportChannelContactsResult> => {
  const { inbox, workspaceId, contacts, ownerId } = props

  const empty: BulkImportChannelContactsResult = {
    importedContacts: 0,
    skippedContacts: 0,
    contactInboxIds: new Map(),
    newContactInboxIds: new Map(),
  }
  if (contacts.length === 0) {
    return empty
  }

  // Dedup by sourceId — prefer first non-null field across duplicates.
  const dedup = new Map<string, IncomingContact>()
  for (const entry of contacts) {
    const key = entry.sourceId
    if (!key) {
      continue
    }
    const existing = dedup.get(key)
    if (!existing) {
      dedup.set(key, { ...entry })
      continue
    }
    dedup.set(key, {
      sourceId: existing.sourceId,
      phoneNumber: existing.phoneNumber ?? entry.phoneNumber,
      phoneNumberId: existing.phoneNumberId ?? entry.phoneNumberId,
      firstName: existing.firstName ?? entry.firstName,
      lastName: existing.lastName ?? entry.lastName,
      email: existing.email ?? entry.email,
      avatar: existing.avatar ?? entry.avatar,
      gender: existing.gender ?? entry.gender,
      locale: existing.locale ?? entry.locale,
      language: existing.language ?? entry.language,
      timezone: existing.timezone ?? entry.timezone,
      sourceUserId: existing.sourceUserId ?? entry.sourceUserId,
      sourceUsername: existing.sourceUsername ?? entry.sourceUsername,
    })
  }

  if (dedup.size === 0) {
    return empty
  }

  const sourceIds = [...dedup.keys()]
  const skippedContacts = 0
  const failureReason: string | undefined = undefined

  // A thread's scoped user id (e.g. a WhatsApp BSUID) may already belong to a
  // row in this inbox under a different sourceId. Matching on it up front
  // resolves the thread to that row instead of attempting an insert that
  // would violate the partial unique index (inboxId, sourceUserId).
  const sourceUserIds = [...dedup.values()].flatMap((entry) =>
    entry.sourceUserId ? [entry.sourceUserId] : [],
  )

  const { importedContacts, contactInboxIds, newContactCreatedEvents } =
    await coexistImportService.resolveOrCreateContactLinks({
      workspaceId,
      inboxId: inbox.id,
      inboxChannel: inbox.channel,
      dedup,
      sourceIds,
      sourceUserIds,
    })

  // Narrow `contactInboxIds` to only the sourceIds that were newly created —
  // derived from `newContactCreatedEvents` rather than re-queried, so this
  // costs nothing extra and can never disagree with the events below.
  const newContactInboxIds = new Map<string, ChannelContactImportLink>()
  for (const event of newContactCreatedEvents) {
    const link = contactInboxIds.get(event.sourceId)
    if (link) {
      newContactInboxIds.set(event.sourceId, link)
    }
  }

  // Post-commit side effects must settle before the caller acknowledges its
  // source job, but failures remain non-fatal for the committed contacts.
  const emissions: Array<{ label: string; promise: Promise<unknown> }> = []
  for (const ev of newContactCreatedEvents) {
    emissions.push(
      {
        label: "contactCreated event",
        promise: Promise.resolve().then(() =>
          emitContactCreated(
            ev.workspaceId,
            ev.contactId,
            ev.firstName,
            ev.phoneNumber,
            ev.email,
            ev.contactInboxId,
          ),
        ),
      },
      {
        label: "contact:created",
        promise: Promise.resolve().then(() =>
          emit("analytics:dashboard", {
            eventType: "contact:created",
            workspaceId: ev.workspaceId,
            contactId: ev.contactInboxId,
            occurredAt: ev.createdAt,
            source: ev.source,
            sourceId: ev.sourceId,
            channel: ev.channel,
            metadata: {
              triggerContext: {
                triggerSource: "worker",
                triggerHandler: "bulkImportChannelContacts",
                triggerType: "contact_created",
              },
            },
          }),
        ),
      },
    )
  }
  const emissionResults = await Promise.allSettled(
    emissions.map(({ promise }) => promise),
  )
  for (const [index, result] of emissionResults.entries()) {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason },
        `[bulk-import] Failed to emit ${emissions[index]?.label ?? "event"}`,
      )
    }
  }

  // Info-only workspace usage for newly-created contacts. Bulk import (coexist
  // history backfill, contact scan) is passive and does not consume billing
  // quota.
  if (importedContacts > 0) {
    if (ownerId) {
      await quotaEnforcementService.incrementBy({
        userId: ownerId,
        metric: "contacts",
        count: importedContacts,
      })
    }
    await workspaceUsageService
      .increment(workspaceId, "contacts", importedContacts)
      .catch((err) => {
        logger.warn(
          { err, workspaceId },
          "workspace usage contact increment failed",
        )
      })
  }

  return {
    importedContacts,
    skippedContacts,
    contactInboxIds,
    newContactInboxIds,
    failureReason,
  }
}
