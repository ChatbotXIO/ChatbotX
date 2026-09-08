import {
  contactInboxRepository,
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import type {
  PendingCoexistAttachment,
  PendingCoexistPatch,
} from "@chatbotx.io/database/schema"
import type { IncomingAttachment } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../lib/logger"

/**
 * Post-batch patches for the WhatsApp Coexistence flush: the three payload
 * families `bulkImportHistorical` cannot express because its contract is
 * insert-only, plus the retry buffer for the ones Meta delivers BEFORE the
 * message they target.
 *
 * Split out of `whatsapp-flush.ts` (already well over the file-size budget)
 * when the pending-patch retry was added — see
 * `.superpowers/sdd/2026-09-04-multi-select-channel-connect/coexist-switch/brief-coexist-history-lifecycle.md`.
 */

/**
 * Media follow-up: `value.messages[]` carries the media asset for a thread
 * message Meta sent earlier. The history row is already in `Message`; we
 * insert an Attachment row pointing at the resolved (contactInboxId, sourceId)
 * → messageId. Followed by a `coexistAttachmentDownload` enqueue.
 */
export type MediaFollowUp = {
  sourceId: string
  contactWaId: string
  attachment: IncomingAttachment
}

export type EditPatch = {
  sourceId: string
  contactWaId: string
  text: string | null
  /** When the edit carries new media, an Attachment row is inserted in
   *  addition to the text UPDATE. Null when text-only edit. */
  attachment: IncomingAttachment | null
}

export type RevokePatch = {
  sourceId: string
  contactWaId: string
}

/**
 * Maximum patches carried on a run between flushes. A patch only stays pending
 * while its parent message is missing, so the buffer is normally near-empty;
 * the cap exists so a pathological stream cannot grow the jsonb column without
 * bound.
 */
export const PENDING_PATCH_CAP = 500

/**
 * Identity of a pending patch. The brief keys on `contactWaId:sourceId`; the
 * kind is folded in because one message can legitimately have both an
 * unresolved media follow-up and an unresolved edit outstanding, and collapsing
 * those two would drop one of them.
 */
export const pendingPatchKey = (patch: {
  kind: PendingCoexistPatch["kind"]
  contactWaId: string
  sourceId: string
}): string => `${patch.kind}:${patch.contactWaId}:${patch.sourceId}`

const toPendingAttachment = (
  attachment: IncomingAttachment,
): PendingCoexistAttachment => ({
  sourceId: attachment.sourceId,
  fileType: attachment.fileType,
  mimeType: attachment.mimeType,
  originPath: attachment.originPath,
  size: attachment.size,
  url: attachment.url,
  width: attachment.width,
  height: attachment.height,
  name: attachment.name,
})

const fromPendingAttachment = (
  attachment: PendingCoexistAttachment,
): IncomingAttachment => ({
  sourceId: attachment.sourceId,
  fileType: attachment.fileType,
  mimeType: attachment.mimeType,
  originPath: attachment.originPath,
  size: attachment.size,
  url: attachment.url,
  width: attachment.width,
  height: attachment.height,
  name: attachment.name,
})

/** Expands patches carried on the run back into the per-batch working shape. */
export const pendingPatchesToBatch = (
  entries: PendingCoexistPatch[],
): {
  mediaFollowUps: MediaFollowUp[]
  edits: EditPatch[]
  revokes: RevokePatch[]
} => {
  const mediaFollowUps: MediaFollowUp[] = []
  const edits: EditPatch[] = []
  const revokes: RevokePatch[] = []
  for (const entry of entries) {
    if (entry.kind === "media") {
      mediaFollowUps.push({
        sourceId: entry.sourceId,
        contactWaId: entry.contactWaId,
        attachment: fromPendingAttachment(entry.attachment),
      })
      continue
    }
    if (entry.kind === "edit") {
      edits.push({
        sourceId: entry.sourceId,
        contactWaId: entry.contactWaId,
        text: entry.text,
        attachment: entry.attachment
          ? fromPendingAttachment(entry.attachment)
          : null,
      })
      continue
    }
    revokes.push({ sourceId: entry.sourceId, contactWaId: entry.contactWaId })
  }
  return { mediaFollowUps, edits, revokes }
}

/**
 * De-duplicates by patch identity and keeps the newest `PENDING_PATCH_CAP`
 * entries, warning about what was dropped. Oldest-first is the right thing to
 * shed: a patch that has been unresolved the longest is the one whose parent
 * message is least likely to ever arrive.
 */
export const capPendingPatches = (
  entries: PendingCoexistPatch[],
): PendingCoexistPatch[] => {
  const byKey = new Map<string, PendingCoexistPatch>()
  for (const entry of entries) {
    byKey.set(pendingPatchKey(entry), entry)
  }
  const unique = Array.from(byKey.values())
  if (unique.length <= PENDING_PATCH_CAP) {
    return unique
  }
  const sorted = unique.sort((a, b) => a.stagedAt.localeCompare(b.stagedAt))
  const dropped = sorted.length - PENDING_PATCH_CAP
  logger.warn(
    { dropped, cap: PENDING_PATCH_CAP },
    "[coexist] WhatsApp pending patch buffer full — dropped oldest patches",
  )
  return sorted.slice(dropped)
}

type ContactInboxRow = {
  id: string
  lastIncomingMessageAt: Date | null
  createdAt: Date
}

/**
 * Resolves a set of customer wa_ids to their ContactInbox rows for this inbox.
 * Returns a Map keyed by sourceId (= wa_id). Missing keys mean either Meta
 * delivered a patch before the history insert (it is carried on the run and
 * retried next flush) or the contact was cap-rejected by bulkImportHistorical.
 */
const resolveContactInboxIds = async (
  inboxId: string,
  contactWaIds: string[],
): Promise<Map<string, ContactInboxRow>> => {
  const ids = new Map<string, ContactInboxRow>()
  if (contactWaIds.length === 0) {
    return ids
  }
  const rows = await contactInboxRepository.findByInboxAndSourceIds({
    inboxId,
    sourceIds: contactWaIds,
  })
  for (const row of rows) {
    if (row.sourceId) {
      ids.set(row.sourceId, {
        id: row.id,
        lastIncomingMessageAt: row.lastIncomingMessageAt,
        createdAt: row.createdAt,
      })
    }
  }
  return ids
}

export type PostBatchPatchInput = {
  workspaceId: string
  inboxId: string
  mediaFollowUps: MediaFollowUp[]
  edits: EditPatch[]
  revokes: RevokePatch[]
  /** `stagedAt` of patches already carried on the run, keyed by patch identity. */
  stagedAtByKey?: Map<string, string>
}

export type PostBatchPatchResult = {
  /** Attachment IDs inserted in this batch, for the download enqueue. */
  insertedAttachmentIds: string[]
  /** Patches whose target message does not exist yet — retry next flush. */
  unresolved: PendingCoexistPatch[]
}

/** Uniform view over the three patch families while resolving them. */
type PatchCandidate = {
  kind: PendingCoexistPatch["kind"]
  sourceId: string
  contactWaId: string
  text: string | null
  attachment: IncomingAttachment | null
}

const toCandidates = (input: PostBatchPatchInput): PatchCandidate[] => [
  ...input.mediaFollowUps.map((patch) => ({
    kind: "media" as const,
    sourceId: patch.sourceId,
    contactWaId: patch.contactWaId,
    text: null,
    attachment: patch.attachment,
  })),
  ...input.edits.map((patch) => ({
    kind: "edit" as const,
    sourceId: patch.sourceId,
    contactWaId: patch.contactWaId,
    text: patch.text,
    attachment: patch.attachment,
  })),
  ...input.revokes.map((patch) => ({
    kind: "revoke" as const,
    sourceId: patch.sourceId,
    contactWaId: patch.contactWaId,
    text: null,
    attachment: null,
  })),
]

const toPending = (
  candidate: PatchCandidate,
  stagedAtByKey: Map<string, string> | undefined,
  now: string,
): PendingCoexistPatch => {
  const stagedAt = stagedAtByKey?.get(pendingPatchKey(candidate)) ?? now
  const base = {
    contactWaId: candidate.contactWaId,
    sourceId: candidate.sourceId,
    stagedAt,
  }
  if (candidate.kind === "media" && candidate.attachment) {
    return {
      ...base,
      kind: "media",
      attachment: toPendingAttachment(candidate.attachment),
    }
  }
  if (candidate.kind === "edit") {
    return {
      ...base,
      kind: "edit",
      text: candidate.text,
      attachment: candidate.attachment
        ? toPendingAttachment(candidate.attachment)
        : null,
    }
  }
  return { ...base, kind: "revoke" }
}

/**
 * Widest safe read window across the contacts touched by this patch set. Null
 * when no ContactInbox resolved at all — every patch is then pending.
 */
const resolveSinceTime = (
  contactInboxByWaId: Map<string, ContactInboxRow>,
): Date | null => {
  const safeSinceTimes = Array.from(contactInboxByWaId.values())
    .map((contactInbox) =>
      getSafeSinceTime(
        contactInbox.lastIncomingMessageAt ?? contactInbox.createdAt,
        365 * 24 * 60 * 60 * 1000,
      ),
    )
    .filter((value): value is Date => value !== undefined)
  if (safeSinceTimes.length === 0) {
    return null
  }
  return new Date(Math.min(...safeSinceTimes.map((value) => value.getTime())))
}

type MessageRepository = Awaited<ReturnType<typeof createMessageRepository>>
type MessageRow = Awaited<
  ReturnType<MessageRepository["findManyBySourceIds"]>
>[number]

/**
 * Single round-trip resolving every patch family at once: an attachment insert
 * needs the Message row, and an edit/revoke needs to know the Message exists
 * before we may call the patch applied rather than pending.
 */
const loadMessageRows = async (input: {
  repo: MessageRepository
  candidates: PatchCandidate[]
  contactInboxByWaId: Map<string, ContactInboxRow>
  workspaceId: string
  sinceTime: Date
}): Promise<Map<string, MessageRow>> => {
  const contactInboxIds: string[] = []
  const sourceIds: string[] = []
  for (const candidate of input.candidates) {
    const contactInbox = input.contactInboxByWaId.get(candidate.contactWaId)
    if (contactInbox) {
      contactInboxIds.push(contactInbox.id)
      sourceIds.push(candidate.sourceId)
    }
  }
  const rows = await input.repo.findManyBySourceIds({
    contactInboxIds,
    sourceIds,
    workspaceId: input.workspaceId,
    sinceTime: input.sinceTime,
  })
  return new Map(
    rows
      .filter((row) => row.sourceId)
      .map((row) => [`${row.contactInboxId}:${row.sourceId}`, row]),
  )
}

type PatchPlan = {
  attachmentRows: Parameters<MessageRepository["bulkCreateAttachments"]>[0]
  patches: Parameters<
    MessageRepository["bulkPatchContentAttributes"]
  >[0]["patches"]
  unresolved: PatchCandidate[]
}

/** The Attachment row an attachment-carrying patch inserts. */
const toAttachmentRow = (
  candidate: PatchCandidate & { attachment: IncomingAttachment },
  message: MessageRow,
  workspaceId: string,
): PatchPlan["attachmentRows"][number] => ({
  id: createId(),
  workspaceId,
  conversationId: message.conversationId,
  messageId: message.id,
  messageCreatedAt: message.createdAt,
  sourceId: candidate.attachment.sourceId,
  fileType: candidate.attachment.fileType,
  mimeType: candidate.attachment.mimeType,
  originPath: candidate.attachment.originPath,
  size: candidate.attachment.size,
  width: candidate.attachment.width ?? undefined,
  height: candidate.attachment.height ?? undefined,
  name: candidate.attachment.name,
})

/** The contentAttributes overlay an edit/revoke applies; null for media. */
const toContentPatch = (
  candidate: PatchCandidate,
  contactInboxId: string,
): PatchPlan["patches"][number] | null => {
  if (candidate.kind === "edit") {
    return {
      contactInboxId,
      sourceId: candidate.sourceId,
      overlay: { edited: true },
      text: candidate.text === null ? undefined : candidate.text,
    }
  }
  if (candidate.kind === "revoke") {
    return {
      contactInboxId,
      sourceId: candidate.sourceId,
      overlay: { revoked: true },
    }
  }
  return null
}

const planPatches = (input: {
  candidates: PatchCandidate[]
  contactInboxByWaId: Map<string, ContactInboxRow>
  messageByKey: Map<string, MessageRow>
  workspaceId: string
}): PatchPlan => {
  const plan: PatchPlan = { attachmentRows: [], patches: [], unresolved: [] }
  for (const candidate of input.candidates) {
    const contactInbox = input.contactInboxByWaId.get(candidate.contactWaId)
    const message = contactInbox
      ? input.messageByKey.get(`${contactInbox.id}:${candidate.sourceId}`)
      : undefined
    if (!(contactInbox && message)) {
      plan.unresolved.push(candidate)
      continue
    }
    if (candidate.attachment) {
      plan.attachmentRows.push(
        toAttachmentRow(
          { ...candidate, attachment: candidate.attachment },
          message,
          input.workspaceId,
        ),
      )
    }
    const contentPatch = toContentPatch(candidate, contactInbox.id)
    if (contentPatch) {
      plan.patches.push(contentPatch)
    }
  }
  return plan
}

const writePatchPlan = async (input: {
  repo: MessageRepository
  plan: PatchPlan
  workspaceId: string
  sinceTime: Date
}): Promise<string[]> => {
  const insertedAttachmentIds: string[] = []
  if (input.plan.attachmentRows.length > 0) {
    const inserted = await input.repo.bulkCreateAttachments(
      input.plan.attachmentRows,
    )
    for (const row of inserted) {
      insertedAttachmentIds.push(row.id)
    }
  }
  if (input.plan.patches.length > 0) {
    await input.repo.bulkPatchContentAttributes({
      workspaceId: input.workspaceId,
      patches: input.plan.patches,
      sinceTime: input.sinceTime,
    })
  }
  return insertedAttachmentIds
}

/**
 * Applies the three post-batch patch families:
 *
 *   - Media follow-ups → INSERT one Attachment row per follow-up, pointing at
 *     the existing Message row. Returned IDs are enqueued for download by the
 *     caller.
 *   - Edits → UPDATE text and merge `edited: true` into contentAttributes.
 *     When the edit carries media, also INSERT a fresh Attachment row.
 *   - Revokes → merge `revoked: true` into contentAttributes (text retained).
 *
 * A patch whose ContactInbox or parent Message is not there yet is NOT dropped
 * (that silently lost the media for good, because the staging row carrying it
 * was still marked processed). It is returned in `unresolved` for the caller to
 * persist on the run and replay at the start of the next batch.
 */
export const applyPostBatchPatches = async (
  input: PostBatchPatchInput,
): Promise<PostBatchPatchResult> => {
  const { workspaceId, inboxId, stagedAtByKey } = input
  const candidates = toCandidates(input)
  if (candidates.length === 0) {
    return { insertedAttachmentIds: [], unresolved: [] }
  }

  const now = new Date().toISOString()
  const carryOver = (pending: PatchCandidate[]): PendingCoexistPatch[] =>
    pending.map((candidate) => toPending(candidate, stagedAtByKey, now))

  const contactInboxByWaId = await resolveContactInboxIds(
    inboxId,
    candidates.map((candidate) => candidate.contactWaId),
  )
  const sinceTime = resolveSinceTime(contactInboxByWaId)
  if (!sinceTime) {
    return { insertedAttachmentIds: [], unresolved: carryOver(candidates) }
  }

  const repo = await createMessageRepository()
  const messageByKey = await loadMessageRows({
    repo,
    candidates,
    contactInboxByWaId,
    workspaceId,
    sinceTime,
  })
  const plan = planPatches({
    candidates,
    contactInboxByWaId,
    messageByKey,
    workspaceId,
  })
  const insertedAttachmentIds = await writePatchPlan({
    repo,
    plan,
    workspaceId,
    sinceTime,
  })

  return { insertedAttachmentIds, unresolved: carryOver(plan.unresolved) }
}
