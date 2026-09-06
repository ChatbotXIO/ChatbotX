import { tagService, tagSyncService } from "@chatbotx.io/business"
import { contactInboxRepository } from "@chatbotx.io/database/repositories"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { logger } from "../../../lib/logger"
import type { LabelContext, LabelEvent } from "./types"

/**
 * Apply one normalized label event. Channel-agnostic: the channel identity
 * lives in `ctx`, so every DB operation here is written once and reused by
 * every channel.
 */
export function applyEvent(
  ctx: LabelContext,
  event: LabelEvent,
): Promise<void> {
  switch (event.type) {
    case "assign":
      return assignLabel(ctx, event)
    case "unassign":
      return unassignLabel(ctx, event)
    case "deleteLabel":
      return removeLabel(ctx, event)
    default:
      throw new Error(
        `Unsupported inbox label event: ${(event as { type: string }).type}`,
      )
  }
}

async function assignLabel(
  ctx: LabelContext,
  event: Extract<LabelEvent, { type: "assign" }>,
): Promise<void> {
  const mapping = await ensureTagChannel(ctx, event.labelId, event.labelName)
  if (!mapping || event.userIds.length === 0) {
    return
  }

  const inboxes = await findInboxes(ctx.inboxId, event.userIds)
  if (inboxes.length === 0) {
    return
  }

  // Link the workspace tag to the contacts; capture the newly-linked ones so we
  // emit "tag applied" exactly once per new pair (same as add-contact-tag).
  const linked = await tagService.linkTagToContactsReturningNew({
    tagId: mapping.tagId,
    contactIds: inboxes.map((inbox) => inbox.contactId),
  })

  // Record the per-channel assignment (used for reconciliation / detach).
  await tagService.recordTagChannelAssignments({
    tagId: mapping.tagId,
    tagChannelId: mapping.tagChannelId,
    contactInboxIds: inboxes.map((inbox) => inbox.id),
  })

  // Per-contact contactInboxId map, keyed off the same `inboxes` list used to
  // build the insert above — each newly-linked contact attributes to the
  // specific ContactInbox that carried this label assignment, not the
  // contact's most-recently-active inbox across every channel.
  const contactInboxIdByContactId = new Map(
    inboxes.map((inbox) => [inbox.contactId, inbox.id]),
  )

  await emitForContacts(
    ctx.workspaceId,
    linked.map((row) => ({
      contactId: row.contactId,
      contactInboxId: contactInboxIdByContactId.get(row.contactId),
    })),
    mapping.tagId,
    emitTagApplied,
  )
}

async function unassignLabel(
  ctx: LabelContext,
  event: Extract<LabelEvent, { type: "unassign" }>,
): Promise<void> {
  if (event.userIds.length === 0) {
    return
  }

  const tagChannel = await findTagChannel(ctx, event.labelId)
  if (!tagChannel) {
    return
  }

  const inboxes = await findInboxes(ctx.inboxId, event.userIds)
  if (inboxes.length === 0) {
    return
  }

  // Remove the per-channel assignment record.
  await tagService.deleteTagChannelAssignments({
    tagChannelId: tagChannel.id,
    contactInboxIds: inboxes.map((inbox) => inbox.id),
  })

  // Remove the workspace tag from those contacts — same as remove-contact-tag.
  const contactIds = inboxes.map((inbox) => inbox.contactId)
  await tagService.detachTagFromContacts({
    tagId: tagChannel.tagId,
    contactIds,
  })

  await emitForContacts(
    ctx.workspaceId,
    inboxes.map((inbox) => ({
      contactId: inbox.contactId,
      contactInboxId: inbox.id,
    })),
    tagChannel.tagId,
    emitTagRemoved,
  )
}

/** Best-effort tag events (failures must not fail the webhook). */
async function emitForContacts(
  workspaceId: string,
  contacts: Array<{ contactId: string; contactInboxId?: string }>,
  tagId: string,
  emit: (
    workspaceId: string,
    contactId: string,
    tagId: string,
    contactInboxId?: string,
  ) => Promise<void>,
): Promise<void> {
  for (const { contactId, contactInboxId } of contacts) {
    try {
      await emit(workspaceId, contactId, tagId, contactInboxId)
    } catch (error) {
      logger.warn({ tagId, error }, "inbox labels: failed to emit tag event")
    }
  }
}

async function removeLabel(
  ctx: LabelContext,
  event: Extract<LabelEvent, { type: "deleteLabel" }>,
): Promise<void> {
  // Map the external label back to the local tag.
  const tagChannel = await findTagChannel(ctx, event.labelId)
  if (!tagChannel) {
    return
  }

  // The tag was deleted on THIS channel only — keep the workspace Tag. Enqueue a
  // channel-scoped delete so the queue removes just this channel's mappings +
  // the contacts tagged via it (NOT a workspace-wide delete-tag).
  await tagSyncService.enqueueDelete({
    workspaceId: ctx.workspaceId,
    tagId: tagChannel.tagId,
    channelType: ctx.channelType,
    integrationId: ctx.integrationId,
  })
}

// ── DB helpers ──────────────────────────────────────────

function findInboxes(inboxId: string, sourceIds: string[]) {
  return contactInboxRepository.listIdsByInboxAndSourceIds({
    inboxId,
    sourceIds,
  })
}

function findTagChannel(ctx: LabelContext, externalLabelId: string) {
  return tagService.findTagChannel({
    workspaceId: ctx.workspaceId,
    channelType: ctx.channelType,
    integrationId: ctx.integrationId,
    externalLabelId,
  })
}

/** Get-or-create the tag (by name) and its channel mapping (by external id). */
async function ensureTagChannel(
  ctx: LabelContext,
  externalLabelId: string,
  name: string,
): Promise<{ tagId: string; tagChannelId: string } | undefined> {
  const existing = await findTagChannel(ctx, externalLabelId)
  if (existing) {
    return { tagId: existing.tagId, tagChannelId: existing.id }
  }
  if (!name) {
    return // cannot create a tag without a name
  }

  const tagId = await tagService.ensureTagByName({
    workspaceId: ctx.workspaceId,
    name,
  })
  if (!tagId) {
    return
  }

  const tagChannelId = await tagService.ensureTagChannel({
    workspaceId: ctx.workspaceId,
    tagId,
    channelType: ctx.channelType,
    integrationId: ctx.integrationId,
    externalLabelId,
  })
  return tagChannelId ? { tagId, tagChannelId } : undefined
}
