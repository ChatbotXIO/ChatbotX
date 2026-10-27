import type {
  PipelineItemPriority,
  PipelineItemStatus,
} from "@chatbotx.io/database/partials"
import type { PipelineAccessScope } from "./access"
import type { PipelineActor } from "./types"

export type PipelineItemWriteFields = {
  title?: string
  description?: string | null
  value?: number | null
  status?: PipelineItemStatus
  priority?: PipelineItemPriority
  dueDate?: Date | null
  /** Field id -> new value; `null` clears the field. */
  fieldValues?: Record<string, string | null>
  /**
   * IANA zone that anchors `date` custom-field values written in this call
   * (the editor's browser zone). Without it, the contact then workspace zone.
   */
  fieldValuesTimezone?: string
  stageId?: string
  assigneeMemberIds?: string[]
  assigneeInboxTeamIds?: string[]
}

export type CreatePipelineItemInput = {
  workspaceId: string
  pipelineId: string
  contactId: string
  fields: PipelineItemWriteFields & { title: string }
  mediaLibraryFileIds?: string[]
  idempotencyKey?: string
  scope: PipelineAccessScope
  actor: PipelineActor
}
