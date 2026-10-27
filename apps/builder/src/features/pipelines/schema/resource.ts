import {
  pipelineActivityKinds,
  pipelineItemPriorities,
  pipelineItemStatuses,
  pipelineSettingsSchema,
  pipelineTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { customFieldTypes } from "@chatbotx.io/utils/custom-field"
import { z } from "zod"

// Ids shared by requests and resources (descriptions tell agents where ids come from).

export const pipelineId = zodBigintIdAsString().describe(
  "Pipeline id. Get it from `pipelines.list`.",
)
export const stageId = zodBigintIdAsString().describe(
  "Stage id. Get it from `pipelines.get` (`stages[].id`).",
)
export const itemId = zodBigintIdAsString().describe(
  "Item id. Get it from `pipelines.listItems`.",
)

// Resources --------------------------------------------------------------------

export const publicPipelineResource = z.object({
  id: z.string(),
  name: z.string(),
  type: pipelineTypes,
  referenceName: z
    .string()
    .describe("Stable machine name used by `{{pipelines.<referenceName>.*}}`."),
  currency: z.string().describe("ISO 4217 code item values are in."),
  settings: pipelineSettingsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const publicPipelineListItemResource = publicPipelineResource.extend({
  itemsCount: z.number().describe("Items currently in the pipeline."),
})

export const publicPipelineStageResource = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  textColor: z.string().nullable(),
  backgroundColor: z.string().nullable(),
  position: z.number(),
  processing: z
    .boolean()
    .describe(
      "True while a large delete/move of this stage is running in the background; new items cannot enter it.",
    ),
})

export const publicPipelineFieldResource = z.object({
  id: z.string(),
  name: z.string(),
  referenceName: z.string(),
  type: customFieldTypes,
  required: z.boolean(),
  position: z.number(),
})

export const publicPipelineDetailResource = publicPipelineResource.extend({
  stages: z.array(publicPipelineStageResource),
  fields: z.array(publicPipelineFieldResource),
})

export const publicPipelineMemberResource = z.object({
  workspaceMemberId: z.string(),
  canView: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canManageSettings: z.boolean(),
})

export const publicPipelineItemResource = z.object({
  id: z.string(),
  pipelineId: z.string(),
  stageId: z.string(),
  contactId: z.string(),
  contactName: z.string().nullable(),
  number: z.number().describe("Item number, counted per workspace."),
  title: z.string(),
  description: z.string().nullable(),
  value: z.number().nullable().describe("Amount in the pipeline currency."),
  status: pipelineItemStatuses,
  priority: pipelineItemPriorities,
  dueDate: z.date().nullable(),
  fieldValues: z
    .record(z.string(), z.string())
    .describe("Custom field values keyed by pipeline field id."),
  assigneeMemberIds: z.array(z.string()),
  assigneeInboxTeamIds: z.array(z.string()),
  commentCount: z.number(),
  createdById: z.string().nullable(),
  stageEnteredAt: z.date(),
  closedAt: z.date().nullable(),
  lastCommentAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const publicPipelineAttachmentResource = z.object({
  mediaLibraryFileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  path: z.string().describe("Storage path of the media-library file."),
})

export const publicPipelineItemDetailResource =
  publicPipelineItemResource.extend({
    attachments: z.array(publicPipelineAttachmentResource),
  })

export const publicPipelineCommentResource = z.object({
  id: z.string(),
  itemId: z.string(),
  text: z.string(),
  createdById: z.string().nullable(),
  createdAt: z.date(),
})

export const publicPipelineActivityResource = z.object({
  id: z.string(),
  kind: pipelineActivityKinds,
  actorKind: z.string(),
  actorUserId: z.string().nullable(),
  fromStageId: z.string().nullable(),
  toStageId: z.string().nullable(),
  fromStatus: pipelineItemStatuses.nullable(),
  toStatus: pipelineItemStatuses.nullable(),
  fromValue: z.number().nullable(),
  toValue: z.number().nullable(),
  fromPriority: pipelineItemPriorities.nullable(),
  toPriority: pipelineItemPriorities.nullable(),
  fromTitle: z.string().nullable(),
  toTitle: z.string().nullable(),
  fromPipelineId: z.string().nullable(),
  fromStageName: z
    .string()
    .nullable()
    .describe(
      "Current name of `fromStageId`; null once that stage is deleted.",
    ),
  toStageName: z
    .string()
    .nullable()
    .describe("Current name of `toStageId`; null once that stage is deleted."),
  fromPipelineName: z
    .string()
    .nullable()
    .describe(
      "For `transferred`: current name of the pipeline the item came from.",
    ),
  pipelineName: z
    .string()
    .nullable()
    .describe(
      "Current name of the pipeline the row was recorded in (a transferred item's history spans pipelines).",
    ),
  occurredAt: z.date(),
})

/** Pipelines with their stages, for pickers (contact filter, trigger conditions). */
export const pipelineOptionsResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      referenceName: z.string(),
      statusLabels: z.object({
        open: z.string(),
        won: z.string(),
        lost: z.string(),
      }),
      stages: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
})

export type PipelineOptionsResponse = z.infer<typeof pipelineOptionsResponse>
