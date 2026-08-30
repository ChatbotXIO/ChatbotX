import { tagSyncService } from "@chatbotx.io/business"
import { and, db, eq, inArray, isNull } from "@chatbotx.io/database/client"
import {
  contactsToTagsModel,
  contactToTagChannelModel,
  tagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
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
  const linked = await db
    .insert(contactsToTagsModel)
    .values(
      inboxes.map((inbox) => ({
        contactId: inbox.contactId,
        tagId: mapping.tagId,
      })),
    )
    .onConflictDoNothing()
    .returning({ contactId: contactsToTagsModel.contactId })

  // Record the per-channel assignment (used for reconciliation / detach).
  await db
    .insert(contactToTagChannelModel)
    .values(
      inboxes.map((inbox) => ({
        tagId: mapping.tagId,
        tagChannelId: mapping.tagChannelId,
        contactInboxId: inbox.id,
      })),
    )
    .onConflictDoNothing()

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
  await db.delete(contactToTagChannelModel).where(
    and(
      eq(contactToTagChannelModel.tagChannelId, tagChannel.id),
      inArray(
        contactToTagChannelModel.contactInboxId,
        inboxes.map((inbox) => inbox.id),
      ),
    ),
  )

  // Remove the workspace tag from those contacts — same as remove-contact-tag.
  const contactIds = inboxes.map((inbox) => inbox.contactId)
  await db
    .delete(contactsToTagsModel)
    .where(
      and(
        eq(contactsToTagsModel.tagId, tagChannel.tagId),
        inArray(contactsToTagsModel.contactId, contactIds),
      ),
    )

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
  return db.query.contactInboxModel.findMany({
    where: { inboxId, sourceId: { in: sourceIds } },
    columns: { id: true, contactId: true },
  })
}

function findTagChannel(ctx: LabelContext, externalLabelId: string) {
  return db.query.tagChannelModel.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      channelType: ctx.channelType,
      integrationId: ctx.integrationId,
      externalLabelId,
    },
    columns: { id: true, tagId: true },
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

  const tagId = await ensureTag(ctx.workspaceId, name)
  if (!tagId) {
    return
  }

  const tagChannelId = await ensureChannel(ctx, tagId, externalLabelId)
  return tagChannelId ? { tagId, tagChannelId } : undefined
}

async function ensureTag(
  workspaceId: string,
  name: string,
): Promise<string | undefined> {
  const where = { workspaceId, name, deletedAt: { isNull: true as const } }

  const found = await db.query.tagModel.findFirst({
    where,
    columns: { id: true },
  })
  if (found) {
    return found.id
  }

  const [created] = await db
    .insert(tagModel)
    .values({ id: createId(), workspaceId, name })
    .onConflictDoNothing({
      // Tag_workspaceId_name_key is a partial unique index (deletedAt IS NULL).
      target: [tagModel.workspaceId, tagModel.name],
      where: isNull(tagModel.deletedAt),
    })
    .returning({ id: tagModel.id })
  if (created) {
    return created.id
  }

  // Lost a race against a concurrent insert — read the winner back.
  const retry = await db.query.tagModel.findFirst({
    where,
    columns: { id: true },
  })
  return retry?.id
}

async function ensureChannel(
  ctx: LabelContext,
  tagId: string,
  externalLabelId: string,
): Promise<string | undefined> {
  const [created] = await db
    .insert(tagChannelModel)
    .values({
      id: createId(),
      workspaceId: ctx.workspaceId,
      tagId,
      channelType: ctx.channelType,
      integrationId: ctx.integrationId,
      externalLabelId,
    })
    .onConflictDoNothing({
      target: [
        tagChannelModel.tagId,
        tagChannelModel.channelType,
        tagChannelModel.integrationId,
      ],
    })
    .returning({ id: tagChannelModel.id })
  if (created) {
    return created.id
  }

  const retry = await db.query.tagChannelModel.findFirst({
    where: {
      tagId,
      workspaceId: ctx.workspaceId,
      channelType: ctx.channelType,
      integrationId: ctx.integrationId,
    },
    columns: { id: true },
  })
  return retry?.id
}
