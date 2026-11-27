import type { DatabaseClient } from "@chatbotx.io/database/client"
import { PIPELINE_LIMITS } from "@chatbotx.io/database/partials"
import {
  pipelineItemRepository,
  pipelineReferenceRepository,
} from "@chatbotx.io/database/repositories"
import type { PipelineItemModel } from "@chatbotx.io/database/types"
import { notFoundException, validationException } from "../errors"
import { sameIdSet } from "./equality"
import type { PipelineItemWriteFields } from "./item-write-types"
import type { PipelineEffect } from "./mutation-engine"
import type { PipelineItemAssignees } from "./types"

type AssigneeFields = Pick<
  PipelineItemWriteFields,
  "assigneeMemberIds" | "assigneeInboxTeamIds"
>

export const hasAssigneePatch = (fields: AssigneeFields): boolean =>
  Boolean(fields.assigneeMemberIds || fields.assigneeInboxTeamIds)

/** Deduplicated assignee ids of a write, capped at the per-item limit. */
export function assigneesFromInput(
  fields: AssigneeFields,
): PipelineItemAssignees {
  const workspaceMemberIds = [...new Set(fields.assigneeMemberIds ?? [])]
  const inboxTeamIds = [...new Set(fields.assigneeInboxTeamIds ?? [])]
  if (
    workspaceMemberIds.length + inboxTeamIds.length >
    PIPELINE_LIMITS.assigneesPerItem
  ) {
    throw validationException(
      "assigneeMemberIds",
      `At most ${PIPELINE_LIMITS.assigneesPerItem} assignees`,
    )
  }
  return { workspaceMemberIds, inboxTeamIds }
}

/** Every assignee must exist in this workspace, or the request is a 404. */
export async function assertAssigneesExist(
  workspaceId: string,
  fields: AssigneeFields,
  tx: DatabaseClient,
) {
  const assignees = assigneesFromInput(fields)
  const [members, teams] = await Promise.all([
    pipelineReferenceRepository.listWorkspaceMembers(
      { workspaceId, ids: assignees.workspaceMemberIds },
      tx,
    ),
    pipelineReferenceRepository.listInboxTeamIds(
      { workspaceId, ids: assignees.inboxTeamIds },
      tx,
    ),
  ])
  if (members.length !== assignees.workspaceMemberIds.length) {
    throw notFoundException("Assigned admin not found")
  }
  if (teams.length !== assignees.inboxTeamIds.length) {
    throw notFoundException("Assigned team not found")
  }
}

type AssigneeRow = {
  itemId: string
  workspaceMemberId: string | null
  inboxTeamId: string | null
}

export const emptyAssignees = (): PipelineItemAssignees => ({
  workspaceMemberIds: [],
  inboxTeamIds: [],
})

/** Buckets assignee rows by item; an item without rows is absent from the map. */
export function groupAssignees(
  rows: AssigneeRow[],
): Map<string, PipelineItemAssignees> {
  const byItem = new Map<string, PipelineItemAssignees>()
  for (const row of rows) {
    const bucket = byItem.get(row.itemId) ?? emptyAssignees()
    if (row.workspaceMemberId) {
      bucket.workspaceMemberIds.push(row.workspaceMemberId)
    }
    if (row.inboxTeamId) {
      bucket.inboxTeamIds.push(row.inboxTeamId)
    }
    byItem.set(row.itemId, bucket)
  }
  return byItem
}

export async function currentAssignees(
  workspaceId: string,
  itemId: string,
  tx: DatabaseClient,
): Promise<PipelineItemAssignees> {
  const rows = await pipelineItemRepository.listAssigneesForItems(
    { workspaceId, itemIds: [itemId] },
    tx,
  )
  return groupAssignees(rows).get(itemId) ?? emptyAssignees()
}

/** Applies an assignee patch when one was sent; reports whether the set changed. */
export async function applyAssignees(input: {
  fields: AssigneeFields
  workspaceId: string
  itemId: string
  before: PipelineItemAssignees
  tx: DatabaseClient
}): Promise<{ changed: boolean }> {
  const { fields, before } = input
  if (!hasAssigneePatch(fields)) {
    return { changed: false }
  }
  const next = assigneesFromInput({
    assigneeMemberIds: fields.assigneeMemberIds ?? before.workspaceMemberIds,
    assigneeInboxTeamIds: fields.assigneeInboxTeamIds ?? before.inboxTeamIds,
  })
  if (
    sameIdSet(next.workspaceMemberIds, before.workspaceMemberIds) &&
    sameIdSet(next.inboxTeamIds, before.inboxTeamIds)
  ) {
    return { changed: false }
  }
  await pipelineItemRepository.replaceAssignees(
    { workspaceId: input.workspaceId, itemId: input.itemId, ...next },
    input.tx,
  )
  return { changed: true }
}

/**
 * The assignee the contact should follow: the earliest user assignee that
 * still resolves, else the earliest team. Null when nobody is assigned.
 */
export async function primaryFromSets(
  workspaceId: string,
  sets: PipelineItemAssignees,
  tx: DatabaseClient,
): Promise<string | null> {
  const [firstMember] = sets.workspaceMemberIds
  if (firstMember) {
    const [resolved] = await pipelineReferenceRepository.listWorkspaceMembers(
      { workspaceId, ids: [firstMember] },
      tx,
    )
    if (resolved) {
      return `u_${resolved.userId}`
    }
  }
  const [firstTeam] = sets.inboxTeamIds
  return firstTeam ? `t_${firstTeam}` : null
}

/**
 * "Assign contact when an item is assigned": when the primary assignee
 * changes to someone, ask the conversation service to follow it after the
 * commit, for conversations that are unassigned or still with the previous
 * primary (others keep their assignee). It never unassigns — the setting only promises assignment.
 */
export async function queueAssignmentEffect(input: {
  pipeline: { id: string; settings: { assignContactOnAssign: boolean } }
  item: PipelineItemModel
  before: PipelineItemAssignees | null
  tx: DatabaseClient
  effects: PipelineEffect[]
}) {
  if (!input.pipeline.settings.assignContactOnAssign) {
    return
  }
  const { workspaceId, id: itemId } = input.item
  const after = await primaryFromSets(
    workspaceId,
    await currentAssignees(workspaceId, itemId, input.tx),
    input.tx,
  )
  if (!after) {
    return
  }
  const beforePrimary = input.before
    ? await primaryFromSets(workspaceId, input.before, input.tx)
    : null
  if (after === beforePrimary) {
    return
  }
  input.effects.push({
    kind: "assignContact",
    workspaceId,
    contactId: input.item.contactId,
    pipelineId: input.pipeline.id,
    itemId,
    assignedId: after,
    previousAssignedId: beforePrimary,
  })
}
