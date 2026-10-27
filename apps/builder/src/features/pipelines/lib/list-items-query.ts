import { activityKindsOf } from "@chatbotx.io/database/partials"
import type {
  PipelineItemFilter,
  PipelineItemSort,
} from "@chatbotx.io/database/repositories"
import type { z } from "zod"
import type { listItemsPublicRequest } from "../schema/public"

type ListItemsRequest = z.infer<typeof listItemsPublicRequest>

const optionalList = <T>(value: T | undefined): T[] | undefined =>
  value === undefined ? undefined : [value]

const rangeOf = (from?: Date, to?: Date) =>
  from || to ? { from, to } : undefined

const closedAsOf = (
  won: ReturnType<typeof rangeOf>,
  lost: ReturnType<typeof rangeOf>,
): PipelineItemFilter["closedAs"] =>
  won || lost
    ? { ...(won ? { won } : {}), ...(lost ? { lost } : {}) }
    : undefined

const AUTOMATION_ACTOR = "automation"

/** The activity condition of the public query; undefined when none of its parts is set. */
const activityMatchOf = (
  input: ListItemsRequest,
): PipelineItemFilter["activityMatch"] => {
  const kinds = activityKindsOf(input.activityGroups)
  const actors = input.activityActor ?? []
  const actorUserIds = actors.filter((actor) => actor !== AUTOMATION_ACTOR)
  const automation = actors.includes(AUTOMATION_ACTOR)
  const occurredAt = rangeOf(input.activityFrom, input.activityTo)
  if (!(kinds || actors.length > 0 || occurredAt)) {
    return
  }
  return {
    kinds,
    actorUserIds: actorUserIds.length > 0 ? actorUserIds : undefined,
    automation: automation || undefined,
    occurredAt,
  }
}

/** One place that turns the public list query into the repository filter and sort. */
export function toItemListQuery(input: ListItemsRequest): {
  filter: PipelineItemFilter
  sort: PipelineItemSort
  limit: number
  cursor?: string
} {
  const hasValueRange =
    input.valueMin !== undefined || input.valueMax !== undefined
  const fieldId = input.fieldId
  return {
    filter: {
      stageIds: optionalList(input.stageId),
      statuses: optionalList(input.status),
      priorities: optionalList(input.priority),
      contactId: input.contactId,
      assigneeMemberIds: optionalList(input.assigneeMemberId),
      assigneeTeamIds: optionalList(input.assigneeInboxTeamId),
      search: input.search,
      value:
        input.valueOperator || hasValueRange
          ? {
              operator: input.valueOperator,
              amount: input.valueAmount,
              min: input.valueMin,
              max: input.valueMax,
            }
          : undefined,
      dueDate: rangeOf(input.dueFrom, input.dueTo),
      createdAt: rangeOf(input.createdFrom, input.createdTo),
      updatedAt: rangeOf(input.updatedFrom, input.updatedTo),
      lastCommentAt: rangeOf(input.lastCommentFrom, input.lastCommentTo),
      statusChangedAt: rangeOf(input.statusChangedFrom, input.statusChangedTo),
      stageEnteredAt: rangeOf(input.stageEnteredFrom, input.stageEnteredTo),
      closedAs: closedAsOf(
        rangeOf(input.wonClosedFrom, input.wonClosedTo),
        rangeOf(input.lostClosedFrom, input.lostClosedTo),
      ),
      activityMatch: activityMatchOf(input),
      fieldConditions:
        fieldId !== undefined && input.fieldOperator !== undefined
          ? {
              [fieldId]: {
                operator: input.fieldOperator,
                value: input.fieldValue,
                valueTo: input.fieldValueTo,
              },
            }
          : undefined,
      timezone: input.timezone,
    },
    sort: { key: input.sort, direction: input.direction },
    limit: input.limit,
    cursor: input.cursor,
  }
}
