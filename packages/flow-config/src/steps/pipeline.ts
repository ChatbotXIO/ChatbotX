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

/**
 * The fields of each pipeline action, shared by the flow step (which adds the
 * step envelope: id, states) and the trigger action (which adds `type`).
 * Both unions below are built from these, so they cannot drift apart.
 */
const pipelineActionFields = {
  addToPipeline: {
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
  },
  moveToStage: { stageId: zodBigintIdAsString("Select a stage") },
  changeValue: {
    value: z
      .string()
      .describe("Opportunity value as a number >= 0; accepts {{variables}}."),
  },
  assign: {
    assigneeMemberIds: assigneeIds,
    assigneeInboxTeamIds: assigneeTeamIds,
  },
  changeStatus: { status: pipelineStatus },
  changePriority: { priority: pipelinePriority },
  changeDueDate: { dueDate: pipelineStepDueDateSchema },
  changeTitle: {
    title: z.string().max(PIPELINE_STEP_LIMITS.title),
  },
  setCustomField: {
    pipelineFieldId: optionalId.describe("Pipeline custom field id."),
    value: z.string(),
  },
  clearCustomField: {
    pipelineFieldIds: z
      .array(zodBigintIdAsString())
      .max(PIPELINE_STEP_LIMITS.maxFieldIds)
      .describe("Pipeline custom field ids to clear."),
  },
  changeDescription: {
    description: z.string().max(PIPELINE_STEP_LIMITS.description),
  },
  removeFromPipeline: {},
  addComment: {
    text: z.string().max(PIPELINE_STEP_LIMITS.comment),
  },
  transfer: {
    destinationPipelineId: zodBigintIdAsString("Select a pipeline"),
    destinationStageId: optionalId
      .optional()
      .describe("Destination stage id; omitted means the first stage."),
  },
} as const satisfies Record<PipelineStepAction, z.ZodRawShape>

const act = <A extends PipelineStepAction>(action: A) =>
  z.object({
    ...baseShape,
    action: z.literal(action),
    ...pipelineActionFields[action],
  })

/**
 * "Pipelines" action step. Contact-scoped actions target the contact's most
 * recently created OPEN item in `pipelineId`; no such item routes to `skip`.
 * Text fields accept `{{variables}}`.
 */
export const pipelineStepSchema = z.discriminatedUnion("action", [
  act("addToPipeline"),
  act("moveToStage"),
  act("changeValue"),
  act("assign"),
  act("changeStatus"),
  act("changePriority"),
  act("changeDueDate"),
  act("changeTitle"),
  act("setCustomField"),
  act("clearCustomField"),
  act("changeDescription"),
  act("removeFromPipeline"),
  act("addComment"),
  act("transfer"),
])

const triggerAct = <A extends PipelineStepAction>(action: A) =>
  z.object({
    type: z.literal("pipeline").describe('Action type "pipeline".'),
    pipelineId: baseShape.pipelineId,
    action: z.literal(action),
    ...pipelineActionFields[action],
  })

/**
 * The stored shape of the trigger action "Pipelines": the same actions and
 * fields as the flow step, without the step envelope (no id, no routing).
 */
export const pipelineActionSchema = z.discriminatedUnion("action", [
  triggerAct("addToPipeline"),
  triggerAct("moveToStage"),
  triggerAct("changeValue"),
  triggerAct("assign"),
  triggerAct("changeStatus"),
  triggerAct("changePriority"),
  triggerAct("changeDueDate"),
  triggerAct("changeTitle"),
  triggerAct("setCustomField"),
  triggerAct("clearCustomField"),
  triggerAct("changeDescription"),
  triggerAct("removeFromPipeline"),
  triggerAct("addComment"),
  triggerAct("transfer"),
])
export type PipelineActionSchema = z.infer<typeof pipelineActionSchema>
export type PipelineActionOf<A extends PipelineStepAction> = Extract<
  PipelineActionSchema,
  { action: A }
>

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

/** Default trigger action for `action`; the trigger editor uses it when the action select changes. */
export const pipelineActionDefaultFn = (
  action: PipelineStepAction = "addToPipeline",
  carry: { pipelineId?: string } = {},
): PipelineActionSchema => {
  const {
    id: _id,
    stepType: _stepType,
    states: _states,
    ...fields
  } = pipelineStepDefaultFn(action, carry)
  return { ...fields, type: "pipeline" } as PipelineActionSchema
}

/** What `findMissingRequiredPipelineFields` needs to know about a field. */
export type RequiredPipelineFieldDefinition = {
  id: string
  required: boolean
}

/**
 * The required pipeline fields an `addToPipeline` action leaves without a
 * value, in the order of `definitions`. Creating an item rejects a missing
 * required field at run time (the step then routes to error), so publish and
 * the step editor check it up front with this one rule. A blank or
 * whitespace-only value counts as missing; a `{{variable}}` counts as set,
 * because its text is only known when the flow runs. When a field has several
 * rows the last one wins, exactly as the action resolves them.
 */
export function findMissingRequiredPipelineFields<
  F extends RequiredPipelineFieldDefinition,
>(
  fieldValues: readonly PipelineStepFieldValue[],
  definitions: readonly F[],
): F[] {
  const finalValues = new Map<string, string>()
  for (const { pipelineFieldId, value } of fieldValues) {
    finalValues.set(pipelineFieldId, value)
  }
  return definitions.filter(
    (definition) =>
      definition.required &&
      (finalValues.get(definition.id) ?? "").trim() === "",
  )
}
