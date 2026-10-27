import {
  createId,
  zodBigintAsString,
  zodBigintIdAsString,
} from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  skipStateDefaultFn,
  skipStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

/** Same bounds the pipeline service enforces; kept literal to avoid a database dependency. */
export const PIPELINE_STEP_LIMITS = {
  title: 200,
  description: 5000,
  comment: 2000,
  assignees: 20,
  maxFieldIds: 50,
} as const

// "" is the cleared / unset draft value.
const optionalId = z.union([z.literal(""), zodBigintIdAsString()])

export const pipelineStepActions = z.enum([
  "addToPipeline",
  "moveToStage",
  "changeValue",
  "assign",
  "changeStatus",
  "changePriority",
  "changeDueDate",
  "changeTitle",
  "setCustomField",
  "clearCustomField",
  "changeDescription",
  "removeFromPipeline",
  "addComment",
  "transfer",
])
export type PipelineStepAction = z.infer<typeof pipelineStepActions>

/**
 * Actions that never route to `skip`: they do not need the contact's open
 * item (only `addToPipeline` today). Every other action skips when the
 * contact has no open item in the pipeline; all actions can `error`.
 */
const PIPELINE_ACTIONS_WITHOUT_SKIP: ReadonlySet<PipelineStepAction> = new Set([
  "addToPipeline",
])

/** Whether a run of `action` can end on the `skip` state. */
export const pipelineActionCanSkip = (action: PipelineStepAction): boolean =>
  !PIPELINE_ACTIONS_WITHOUT_SKIP.has(action)

/**
 * Due date source: none (clear / leave empty), a date or datetime contact
 * custom field (a blank field clears it), or a fixed instant.
 */
export const pipelineStepDueDateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("customField"),
    // "" is the unset draft; the runtime reports it as `error`.
    customFieldId: optionalId.describe(
      "Contact custom field (date or datetime) holding the due date. Get ids from `contacts.listCustomFields`.",
    ),
  }),
  z.object({
    mode: z.literal("fixed"),
    at: z.iso.datetime({ offset: true }).describe("Fixed ISO-8601 instant."),
  }),
])
export type PipelineStepDueDate = z.infer<typeof pipelineStepDueDateSchema>

const pipelineStepFieldValueSchema = z.object({
  pipelineFieldId: zodBigintIdAsString().describe(
    "Pipeline custom field id. Get ids from `pipelines.get`.",
  ),
  value: z.string().describe("Value; accepts {{variables}}."),
})
export type PipelineStepFieldValue = z.infer<
  typeof pipelineStepFieldValueSchema
>

const pipelineStatus = z.enum(["open", "won", "lost"])
const pipelinePriority = z.enum(["low", "medium", "high"])

const assigneeIds = z
  .array(zodBigintIdAsString())
  .max(PIPELINE_STEP_LIMITS.assignees)
  .describe("Workspace member ids.")
const assigneeTeamIds = z
  .array(zodBigintIdAsString())
  .max(PIPELINE_STEP_LIMITS.assignees)
  .describe("Inbox team ids.")

const baseShape = {
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.pipeline)
    .describe('Step type discriminator: "pipeline".'),
  pipelineId: zodBigintIdAsString("Select a pipeline").describe(
    "Pipeline the action applies to. Get ids from `pipelines.list`.",
  ),
  states: z.tuple([successStateSchema, errorStateSchema, skipStateSchema]),
}

const act = <A extends PipelineStepAction, S extends z.ZodRawShape>(
  action: A,
  shape: S,
) =>
  z.object({
    ...baseShape,
    action: z.literal(action),
    ...shape,
  })

/**
 * "Pipelines" action step. Contact-scoped actions target the contact's most
 * recently created OPEN item in `pipelineId`; no such item routes to `skip`.
 * Text fields accept `{{variables}}`.
 */
export const pipelineStepSchema = z.discriminatedUnion("action", [
  act("addToPipeline", {
    title: z
      .string()
      .max(PIPELINE_STEP_LIMITS.title)
      .describe("Item title; accepts {{variables}}."),
    description: z.string().max(PIPELINE_STEP_LIMITS.description),
    assigneeMemberIds: assigneeIds,
    assigneeInboxTeamIds: assigneeTeamIds,
    status: pipelineStatus,
    // "" (cleared in the editor) still means the first stage.
    stageId: optionalId
      .optional()
      .describe("Stage id; omitted means the first stage."),
    dueDate: pipelineStepDueDateSchema,
    fieldValues: z
      .array(pipelineStepFieldValueSchema)
      .max(PIPELINE_STEP_LIMITS.maxFieldIds)
      .describe("Pipeline custom field values ({{variables}} allowed)."),
  }),
  act("moveToStage", { stageId: zodBigintIdAsString("Select a stage") }),
  act("changeValue", {
    value: z
      .string()
      .describe("Opportunity value as a number >= 0; accepts {{variables}}."),
  }),
  act("assign", {
    assigneeMemberIds: assigneeIds,
    assigneeInboxTeamIds: assigneeTeamIds,
  }),
  act("changeStatus", { status: pipelineStatus }),
  act("changePriority", { priority: pipelinePriority }),
  act("changeDueDate", { dueDate: pipelineStepDueDateSchema }),
  act("changeTitle", {
    title: z.string().max(PIPELINE_STEP_LIMITS.title),
  }),
  act("setCustomField", {
    pipelineFieldId: optionalId.describe("Pipeline custom field id."),
    value: z.string(),
  }),
  act("clearCustomField", {
    pipelineFieldIds: z
      .array(zodBigintIdAsString())
      .max(PIPELINE_STEP_LIMITS.maxFieldIds)
      .describe("Pipeline custom field ids to clear."),
  }),
  act("changeDescription", {
    description: z.string().max(PIPELINE_STEP_LIMITS.description),
  }),
  act("removeFromPipeline", {}),
  act("addComment", {
    text: z.string().max(PIPELINE_STEP_LIMITS.comment),
  }),
  act("transfer", {
    destinationPipelineId: zodBigintIdAsString("Select a pipeline"),
    destinationStageId: optionalId
      .optional()
      .describe("Destination stage id; omitted means the first stage."),
  }),
])

export type PipelineStepSchema = z.infer<typeof pipelineStepSchema>
export type PipelineStepOf<A extends PipelineStepAction> = Extract<
  PipelineStepSchema,
  { action: A }
>

const defaultStates = () =>
  [
    successStateDefaultFn(),
    errorStateDefaultFn(),
    skipStateDefaultFn(),
  ] as PipelineStepSchema["states"]

/** Builds the default step for an action; the editor uses it when the action select changes. */
export const pipelineStepDefaultFn = (
  action: PipelineStepAction = "addToPipeline",
  carry: {
    id?: string
    pipelineId?: string
    states?: PipelineStepSchema["states"]
  } = {},
): PipelineStepSchema => {
  const base = {
    id: carry.id ?? createId(),
    stepType: stepTypes.enum.pipeline,
    pipelineId: carry.pipelineId ?? "",
    states: carry.states ?? defaultStates(),
  }
  const none = { mode: "none" } as const
  switch (action) {
    case "addToPipeline":
      return {
        ...base,
        action,
        title: "{{full_name}}",
        description: "",
        assigneeMemberIds: [],
        assigneeInboxTeamIds: [],
        status: "open",
        dueDate: none,
        fieldValues: [],
      }
    case "moveToStage":
      return { ...base, action, stageId: "" }
    case "changeValue":
      return { ...base, action, value: "" }
    case "assign":
      return {
        ...base,
        action,
        assigneeMemberIds: [],
        assigneeInboxTeamIds: [],
      }
    case "changeStatus":
      return { ...base, action, status: "won" }
    case "changePriority":
      return { ...base, action, priority: "medium" }
    case "changeDueDate":
      return { ...base, action, dueDate: none }
    case "changeTitle":
      return { ...base, action, title: "" }
    case "setCustomField":
      return { ...base, action, pipelineFieldId: "", value: "" }
    case "clearCustomField":
      return { ...base, action, pipelineFieldIds: [] }
    case "changeDescription":
      return { ...base, action, description: "" }
    case "removeFromPipeline":
      return { ...base, action }
    case "addComment":
      return { ...base, action, text: "" }
    case "transfer":
      return { ...base, action, destinationPipelineId: "" }
    default: {
      const exhaustive: never = action
      throw new Error(`Unhandled pipeline action: ${String(exhaustive)}`)
    }
  }
}
