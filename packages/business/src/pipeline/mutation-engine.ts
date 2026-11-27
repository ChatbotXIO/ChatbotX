import { db } from "@chatbotx.io/database/client"
import type { PipelineActivityKind } from "@chatbotx.io/database/partials"
import {
  acquirePipelineAdvisoryLock,
  type PipelineActivityInsert,
} from "@chatbotx.io/database/repositories"
import type {
  PipelineItemModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import {
  emitPipelineItemEvent,
  type PipelineEventType,
  type PipelineItemEventMetadata,
} from "@chatbotx.io/events"
import {
  type PipelineItemChangedData,
  RealtimeEventType,
} from "@chatbotx.io/realtime-protocol"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { conversationService } from "../conversation/service"
import { logger } from "../logger"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"
import type { PipelineWithCurrency } from "./currency"
import { sameStringRecord } from "./equality"
import { currentAssignees, primaryFromSets } from "./item-assignees"
import type { PipelineActor, PipelineItemSnapshot } from "./types"

/**
 * One path for every item write: compare the item before and after, then
 * derive the activity rows and the post-commit effects from that difference.
 * Services never hand-build either, so a new attribute or event is one entry
 * in the tables below.
 */

type Change<T> = { from: T; to: T }

export type PipelineItemDiff = {
  stage?: Change<string>
  status?: Change<PipelineItemSnapshot["status"]>
  priority?: Change<PipelineItemSnapshot["priority"]>
  value?: Change<number | null>
  dueDate?: Change<Date | null>
  title?: Change<string>
  description?: true
  fieldValues?: true
}

const sameDate = (a: Date | null, b: Date | null): boolean =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null)

export function diffPipelineItem(
  before: PipelineItemSnapshot,
  after: PipelineItemSnapshot,
): PipelineItemDiff {
  const diff: PipelineItemDiff = {}
  if (before.stageId !== after.stageId) {
    diff.stage = { from: before.stageId, to: after.stageId }
  }
  if (before.status !== after.status) {
    diff.status = { from: before.status, to: after.status }
  }
  if (before.priority !== after.priority) {
    diff.priority = { from: before.priority, to: after.priority }
  }
  if (before.value !== after.value) {
    diff.value = { from: before.value, to: after.value }
  }
  if (!sameDate(before.dueDate, after.dueDate)) {
    diff.dueDate = { from: before.dueDate, to: after.dueDate }
  }
  if (before.title !== after.title) {
    diff.title = { from: before.title, to: after.title }
  }
  if (before.description !== after.description) {
    diff.description = true
  }
  if (!sameStringRecord(before.fieldValues, after.fieldValues)) {
    diff.fieldValues = true
  }
  return diff
}

export const isEmptyDiff = (diff: PipelineItemDiff): boolean =>
  Object.keys(diff).length === 0

type ActivityContext = {
  item: PipelineItemModel
  actor: PipelineActor
  now: Date
  /** Set on a transfer: the pipeline the item left. */
  fromPipelineId?: string
}

type ActivityRowBuilder = (
  diff: PipelineItemDiff,
  context: ActivityContext,
) => Partial<PipelineActivityInsert> | null

/** One entry per attribute: the activity kind it records and its from/to columns. */
const ACTIVITY_BUILDERS: ReadonlyArray<
  readonly [PipelineActivityKind, ActivityRowBuilder]
> = [
  [
    "stageChanged",
    (diff) =>
      diff.stage
        ? { fromStageId: diff.stage.from, toStageId: diff.stage.to }
        : null,
  ],
  [
    "statusChanged",
    (diff, { item }) =>
      diff.status
        ? {
            fromStatus: diff.status.from,
            toStatus: diff.status.to,
            // Value at closure, so analytics can sum won/lost value.
            toValue: item.value,
          }
        : null,
  ],
  [
    "valueChanged",
    (diff) =>
      diff.value
        ? { fromValue: diff.value.from, toValue: diff.value.to }
        : null,
  ],
  [
    "priorityChanged",
    (diff) =>
      diff.priority
        ? { fromPriority: diff.priority.from, toPriority: diff.priority.to }
        : null,
  ],
  [
    "dueDateChanged",
    (diff) =>
      diff.dueDate
        ? { fromDueDate: diff.dueDate.from, toDueDate: diff.dueDate.to }
        : null,
  ],
  [
    "titleChanged",
    (diff) =>
      diff.title
        ? { fromTitle: diff.title.from, toTitle: diff.title.to }
        : null,
  ],
  ["descriptionChanged", (diff) => (diff.description ? {} : null)],
  ["fieldValuesChanged", (diff) => (diff.fieldValues ? {} : null)],
]

export function activityRowFor(
  kind: PipelineActivityKind,
  context: ActivityContext,
  extra: Partial<PipelineActivityInsert> = {},
): PipelineActivityInsert {
  const { item, actor, now, fromPipelineId } = context
  return {
    workspaceId: item.workspaceId,
    pipelineId: item.pipelineId,
    itemId: item.id,
    itemNumber: item.number,
    itemTitle: item.title,
    contactId: item.contactId,
    kind,
    actorKind: actor.kind,
    actorUserId: actor.userId,
    actorSourceId: actor.sourceId,
    fromPipelineId,
    occurredAt: now,
    ...extra,
  }
}

/** One activity row per changed attribute. */
export function activityRowsFromDiff(
  diff: PipelineItemDiff,
  context: ActivityContext,
): PipelineActivityInsert[] {
  return ACTIVITY_BUILDERS.flatMap(([kind, build]) => {
    const columns = build(diff, context)
    return columns ? [activityRowFor(kind, context, columns)] : []
  })
}

// Effects ---------------------------------------------------------------------

export type PipelineEffect =
  | {
      kind: "event"
      eventType: PipelineEventType
      workspaceId: string
      contactId: string
      metadata: PipelineItemEventMetadata
    }
  | {
      kind: "realtime"
      workspaceId: string
      data: PipelineItemChangedData
    }
  | {
      kind: "assignContact"
      workspaceId: string
      contactId: string
      pipelineId: string
      itemId: string
      /** `u_<userId>` or `t_<inboxTeamId>`. */
      assignedId: string
      /** The item's primary assignee before this change, in the same form. */
      previousAssignedId: string | null
    }

export type PipelineEventSubject = {
  /** Carries the effective currency, captured when the event is emitted. */
  pipeline: PipelineWithCurrency
  stage: PipelineStageModel
  item: PipelineItemModel
  actor: PipelineActor
  stageNames: ReadonlyMap<string, string>
}

export function pipelineEventMetadata(
  subject: PipelineEventSubject,
  extra: Partial<PipelineItemEventMetadata> = {},
): PipelineItemEventMetadata {
  const { pipeline, stage, item, actor } = subject
  return {
    sourceId: pipeline.id,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    pipelineReferenceName: pipeline.referenceName,
    itemId: item.id,
    itemNumber: item.number,
    title: item.title,
    contactId: item.contactId,
    stageId: stage.id,
    stageName: stage.name,
    status: item.status,
    statusLabel: pipeline.settings.statusLabels[item.status],
    priority: item.priority,
    value: item.value,
    currency: pipeline.currency,
    dueDate: item.dueDate?.toISOString() ?? null,
    actorKind: actor.kind,
    actorUserId: actor.userId,
    ...extra,
  }
}

const eventEffect = (
  eventType: PipelineEventType,
  subject: PipelineEventSubject,
  extra: Partial<PipelineItemEventMetadata> = {},
): PipelineEffect => ({
  kind: "event",
  eventType,
  workspaceId: subject.item.workspaceId,
  contactId: subject.item.contactId,
  metadata: pipelineEventMetadata(subject, extra),
})

type EventBuilder = (
  diff: PipelineItemDiff,
  subject: PipelineEventSubject,
) => PipelineEffect | null

/** One entry per attribute that has a trigger/webhook event. */
const EVENT_BUILDERS: readonly EventBuilder[] = [
  (diff, subject) =>
    diff.stage
      ? eventEffect("pipelineItemMovedToStage", subject, {
          fromStageId: diff.stage.from,
          fromStageName: subject.stageNames.get(diff.stage.from),
        })
      : null,
  (diff, subject) =>
    diff.value
      ? eventEffect("pipelineItemValueChanged", subject, {
          previousValue: diff.value.from,
        })
      : null,
  (diff, subject) =>
    diff.status
      ? eventEffect("pipelineItemStatusChanged", subject, {
          previousStatus: diff.status.from,
        })
      : null,
  (diff, subject) =>
    diff.priority
      ? eventEffect("pipelineItemPriorityChanged", subject, {
          previousPriority: diff.priority.from,
        })
      : null,
]

export function effectsFromDiff(
  diff: PipelineItemDiff,
  subject: PipelineEventSubject,
): PipelineEffect[] {
  const effects: PipelineEffect[] = []
  for (const build of EVENT_BUILDERS) {
    const effect = build(diff, subject)
    if (effect) {
      effects.push(effect)
    }
  }
  if (!isEmptyDiff(diff)) {
    effects.push(realtimeEffect(subject.item, diff.stage ? "moved" : "updated"))
  }
  return effects
}

export const createdEffects = (
  subject: PipelineEventSubject,
): PipelineEffect[] => [
  eventEffect("pipelineItemCreated", subject),
  realtimeEffect(subject.item, "created"),
]

/** Item-level change when `id` is given; a pipeline-wide one (structure, bulk) when omitted. */
export function realtimeEffect(
  item: Pick<PipelineItemModel, "workspaceId" | "pipelineId"> & {
    id?: string
    contactId?: string
  },
  change: PipelineItemChangedData["change"],
): PipelineEffect {
  return {
    kind: "realtime",
    workspaceId: item.workspaceId,
    data: {
      pipelineId: item.pipelineId,
      ...(item.id ? { itemId: item.id } : {}),
      ...(item.contactId ? { contactId: item.contactId } : {}),
      change,
    },
  }
}

const EFFECT_HANDLERS: {
  [K in PipelineEffect["kind"]]: (
    effect: Extract<PipelineEffect, { kind: K }>,
  ) => Promise<void>
} = {
  event: async (effect) => {
    await emitPipelineItemEvent(
      effect.eventType,
      effect.workspaceId,
      effect.contactId,
      effect.metadata,
    )
  },
  realtime: async (effect) => {
    await queueWorkspaceRealtimeEvent(effect.workspaceId, {
      eventType: RealtimeEventType.pipelineItemChanged,
      data: effect.data,
    })
  },
  assignContact: async (effect) => {
    const { workspaceId, contactId, itemId } = effect
    // Effects run after their transaction released the item, so quick
    // assignee changes (A→B, B→C) can dispatch late or out of order. Per
    // contact, one at a time, each effect moves the conversation to the item's
    // *current* primary, from an unassigned conversation or one still with
    // either side of its own transition. Applied in any order, A→B→C ends on C;
    // a conversation someone else owns keeps its assignee.
    // One connection for the whole step (lock, lookups, locked update), so
    // concurrent effects cannot starve the pool; notifications run after commit.
    const afterCommit: Array<() => Promise<void>> = []
    await db.transaction(async (tx) => {
      await acquirePipelineAdvisoryLock(
        tx,
        `pipeline-assign-contact:${workspaceId}:${contactId}`,
      )
      const current = await primaryFromSets(
        workspaceId,
        await currentAssignees(workspaceId, itemId, tx),
        tx,
      )
      // No primary any more (unassigned, deleted): the setting never unassigns.
      if (!current) {
        return
      }
      await conversationService.assignByContactIds({
        workspaceId,
        contactIds: [contactId],
        assignedId: current,
        triggerContext: {
          triggerSource: "pipeline",
          triggerHandler: `${effect.pipelineId}:${itemId}`,
        },
        // A conversation already with `current` is left alone (no repeat event).
        onlyFromAssignees: [
          null,
          effect.previousAssignedId,
          effect.assignedId,
        ].filter((assignee) => assignee !== current),
        tx,
        afterCommit: (callback) => afterCommit.push(callback),
      })
    })
    for (const callback of afterCommit) {
      await callback()
    }
  },
}

/** Cache tag of the per-pipeline item counts shown on the pipeline list. */
export const pipelineCountsCacheTag = (workspaceId: string) =>
  `pipelines:${workspaceId}:counts`

/** Realtime changes that add items to or remove them from a pipeline. */
const COUNT_CHANGES: ReadonlySet<PipelineItemChangedData["change"]> = new Set([
  "created",
  "deleted",
  "bulk",
])

/** Workspaces whose item counts these effects change (a transfer counts once). */
function workspacesWithCountChanges(
  effects: readonly PipelineEffect[],
): string[] {
  return [
    ...new Set(
      effects.flatMap((effect) =>
        effect.kind === "realtime" && COUNT_CHANGES.has(effect.data.change)
          ? [effect.workspaceId]
          : [],
      ),
    ),
  ]
}

/**
 * Runs after the transaction committed, in order. A failing effect is logged
 * and never fails the request that already succeeded — the same guarantee
 * level as every other post-write event in the platform.
 */
export async function dispatchPipelineEffects(
  effects: readonly PipelineEffect[],
): Promise<void> {
  const countTags = workspacesWithCountChanges(effects).map(
    pipelineCountsCacheTag,
  )
  if (countTags.length > 0) {
    try {
      await invalidateCacheByTags(countTags)
    } catch (error) {
      logger.error({ err: error }, "Pipeline count cache invalidation failed")
    }
  }
  for (const effect of effects) {
    try {
      // The handler map is keyed by `kind`, so the pair is always consistent.
      await (
        EFFECT_HANDLERS[effect.kind] as (
          effect: PipelineEffect,
        ) => Promise<void>
      )(effect)
    } catch (error) {
      logger.error(
        { err: error, effectKind: effect.kind },
        "Pipeline post-commit effect failed",
      )
    }
  }
}
