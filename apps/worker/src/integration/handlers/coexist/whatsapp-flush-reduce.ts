import { isWhatsappHistoryTerminal } from "@chatbotx.io/business/coexist/history"
import type { WhatsappCoexistStagingModel } from "@chatbotx.io/database/types"
import type { IncomingContact } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type { HistoricalContactMessages } from "./bulk-historical-import"
import type {
  EditPatch,
  MediaFollowUp,
  RevokePatch,
} from "./whatsapp-flush-patches"
import {
  type ContactWithMessage,
  extractFromValue,
  type HistoryMetadata,
  reduceMetadata,
} from "./whatsapp-history-payload"

/**
 * The pure half of one WhatsApp Coexistence flush batch: staged payloads in,
 * import batch + post-batch patches + history metadata out. Nothing here reads
 * or writes the database, so the drain's ownership rules stay auditable in
 * `whatsapp-flush.ts`.
 */

/** What one staged batch reduced to, before anything is written. */
export type ReducedBatch = {
  batch: HistoricalContactMessages[]
  mediaFollowUps: MediaFollowUp[]
  edits: EditPatch[]
  revokes: RevokePatch[]
  parseFailedRowIds: string[]
  declined: boolean
  metadata: HistoryMetadata | null
  /** True when any metadata ENTRY in this batch was Meta's terminal marker. */
  terminalSeen: boolean
}

/**
 * Flattens + coalesces the staged payloads of one batch per `sourceId`, and
 * accumulates the post-batch patches, the decline flag and the furthest
 * (phase, progress, chunkOrder) history metadata. Pure apart from logging.
 */
export const reduceStagedRows = (
  rows: WhatsappCoexistStagingModel[],
  context: { runId: string; phoneNumberId: string },
): ReducedBatch => {
  const rowGroups = new Map<string, ContactWithMessage[]>()
  const reduced: Omit<ReducedBatch, "batch"> = {
    mediaFollowUps: [],
    edits: [],
    revokes: [],
    parseFailedRowIds: [],
    declined: false,
    metadata: null,
    terminalSeen: false,
  }

  for (const row of rows) {
    const extracted = extractFromValue(row.payload)
    if (extracted.parseFailed) {
      reduced.parseFailedRowIds.push(row.id)
      logger.error(
        {
          runId: context.runId,
          phoneNumberId: context.phoneNumberId,
          stagingId: row.id,
          payloadHash: row.payloadHash,
        },
        "[coexist] Unparseable WhatsApp payload — parked as parse-failed",
      )
      continue
    }
    for (const entry of extracted.entries) {
      if (!entry.contact.sourceId) {
        continue
      }
      const group = rowGroups.get(entry.contact.sourceId) ?? []
      group.push(entry)
      rowGroups.set(entry.contact.sourceId, group)
    }
    reduced.mediaFollowUps.push(...extracted.mediaFollowUps)
    reduced.edits.push(...extracted.edits)
    reduced.revokes.push(...extracted.revokes)
    reduced.declined ||= extracted.declined
    // The terminal signal is checked per metadata ENTRY as well as from the
    // reduced metadata at the end of the drain: cheaper, and it holds even when
    // a payload lists its phases out of order.
    for (const entry of extracted.metadataEntries) {
      if (
        isWhatsappHistoryTerminal({
          lastPhase: entry.phase,
          syncProgress: entry.progress,
        })
      ) {
        reduced.terminalSeen = true
      }
    }
    if (extracted.metadata) {
      reduced.metadata = reduceMetadata(reduced.metadata, extracted.metadata)
    }
  }

  return { ...reduced, batch: toHistoricalBatch(rowGroups) }
}

/** Coalesces contact fields across a group's entries (first non-null wins). */
const mergeContact = (entries: ContactWithMessage[]): IncomingContact => {
  const [first, ...rest] = entries
  return rest.reduce<IncomingContact>(
    (acc, entry) => ({
      sourceId: acc.sourceId,
      phoneNumber: acc.phoneNumber ?? entry.contact.phoneNumber,
      phoneNumberId: acc.phoneNumberId ?? entry.contact.phoneNumberId,
      firstName: acc.firstName ?? entry.contact.firstName,
      lastName: acc.lastName ?? entry.contact.lastName,
      email: acc.email ?? entry.contact.email,
      avatar: acc.avatar ?? entry.contact.avatar,
      gender: acc.gender ?? entry.contact.gender,
      sourceUserId: acc.sourceUserId ?? entry.contact.sourceUserId,
      sourceUsername: acc.sourceUsername ?? entry.contact.sourceUsername,
    }),
    first.contact,
  )
}

const toHistoricalBatch = (
  rowGroups: Map<string, ContactWithMessage[]>,
): HistoricalContactMessages[] =>
  Array.from(rowGroups.values(), (entries) => ({
    contact: mergeContact(entries),
    messages: entries.flatMap((entry) =>
      entry.message ? [entry.message] : [],
    ),
  }))
