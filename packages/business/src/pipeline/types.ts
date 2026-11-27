import type { PipelineActorKind } from "@chatbotx.io/database/partials"
import type {
  PipelineItemActivityModel,
  PipelineItemModel,
} from "@chatbotx.io/database/types"

/** What caused a change; recorded on every activity row and event. */
export type PipelineActor = {
  kind: PipelineActorKind
  userId: string | null
  /** Workspace token id, flow id or trigger id, depending on `kind`. */
  sourceId: string | null
}

export const userPipelineActor = (userId: string | null): PipelineActor => ({
  kind: "user",
  userId,
  sourceId: null,
})

export type PipelineItemAssignees = {
  workspaceMemberIds: string[]
  inboxTeamIds: string[]
}

export type PipelineItemSnapshot = Pick<
  PipelineItemModel,
  | "stageId"
  | "status"
  | "priority"
  | "value"
  | "dueDate"
  | "title"
  | "description"
  | "fieldValues"
>

/**
 * An activity row with the current names of the stages and pipelines it
 * references (null once deleted). A transferred item's history spans
 * pipelines, so the names cannot come from the item's current board.
 */
export type PipelineActivityView = PipelineItemActivityModel & {
  fromStageName: string | null
  toStageName: string | null
  fromPipelineName: string | null
  pipelineName: string | null
}

export type PipelineActivityPage = {
  items: PipelineActivityView[]
  nextCursor: string | null
}
