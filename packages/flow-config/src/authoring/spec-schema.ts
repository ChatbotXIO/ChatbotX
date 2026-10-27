import { zodBigintAsString, zodBigintIdAsString } from "@chatbotx.io/utils"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { z } from "zod"
import { countMessageCharacters } from "../channel-rules/characters"
import { BUTTON_LABEL_MAX } from "../steps/button"
import {
  PIPELINE_STEP_LIMITS,
  pipelineActionCanSkip,
  pipelineStepActions,
} from "../steps/pipeline"
import { sendProductsDisplays } from "../steps/send-products"
import { sendViewCatalogStepSchema } from "../steps/send-view-catalog"
import { waitStepDelayUnits } from "../steps/wait"
import { flowValidationCodes } from "../validation-codes"

const MAX_SPEC_BUTTONS = 3
const MAX_SPEC_TEXT_LENGTH = 1000
const MAX_FLOW_NAME_LENGTH = 255

/** Due date source of a `pipeline` spec step; the custom field is referenced by name. */
export type PipelineSpecDueDate =
  | { mode: "none" }
  | { mode: "fixed"; at: string }
  | { mode: "customField"; customFieldName: string }

export type PipelineStepSpec = {
  type: "pipeline"
  id?: string
  action: z.infer<typeof pipelineStepActions>
  pipeline: string
  title?: string
  description?: string
  status?: "open" | "won" | "lost"
  priority?: "low" | "medium" | "high"
  stage?: string
  assigneeMemberIds?: string[]
  assigneeInboxTeamIds?: string[]
  dueDate?: PipelineSpecDueDate
  fieldValues?: Array<{ field: string; value: string }>
  value?: string
  field?: string
  fields?: string[]
  text?: string
  destinationPipeline?: string
  destinationStage?: string
  onError?: FlowStepSpec[]
  onSkip?: FlowStepSpec[]
}

/**
 * The agent-facing flow DSL. A small, deliberately curated subset of the
 * full node/step surface — the goal is an agent reliably building a working
 * flow, not exposing every editor feature. Every field carries `.describe()`:
 * this schema is also the source for `GET /v1/schemas/flow-spec`, so the
 * description IS the documentation an LLM sees.
 *
 * Hand-written recursive TS type first (`send.buttons[].then` and
 * `branch.cases[].then`/`.otherwise` reference the step array itself) so
 * `z.lazy` can close the cycle — zod cannot infer a recursive type from a
 * schema that references itself before it exists.
 */
export type FlowStepSpec =
  | {
      type: "send"
      id?: string
      text?: string
      imageUrl?: string
      fileUrl?: string
      buttons?: Array<{ text: string; then?: FlowStepSpec[] }>
    }
  | { type: "sendTemplate"; id?: string; templateName: string }
  | {
      type: "sendProducts"
      id?: string
      display: z.infer<typeof sendProductsDisplays>
      header?: string
      body?: string
      footer?: string
      sections?: Array<{ title?: string; productIds: string[] }>
    }
  | {
      type: "sendViewCatalog"
      id?: string
      text: string
      footer?: string
      thumbnailProductId?: string
    }
  | {
      type: "wait"
      id?: string
      duration: number
      unit: z.infer<typeof waitStepDelayUnits>
    }
  | {
      type: "branch"
      id?: string
      cases: Array<{
        match?: "and" | "or"
        when: Array<{
          field: string
          operator: string
          value?: string | string[] | [string, string]
        }>
        then: FlowStepSpec[]
      }>
      otherwise?: FlowStepSpec[]
    }
  | {
      type: "action"
      id?: string
      action:
        | "addTags"
        | "removeTags"
        | "setCustomField"
        | "assignConversation"
        | "archiveConversation"
      tagNames?: string[]
      customFieldName?: string
      value?: string
      assigneeId?: string
    }
  | PipelineStepSpec
  | { type: "startFlow"; id?: string; flowName: string }
  | { type: "addNote"; id?: string; note: string }
  | { type: "goto"; targetId: string }

const stepIdField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Stable id for this step. Omit to auto-generate one. Set it explicitly when a `goto` elsewhere needs to jump to this exact step.",
  )

const stepTypeLiteral = <Type extends string>(type: Type) =>
  z.literal(type).describe(`Step type: "${type}".`)

const sendButtonSpecSchema: z.ZodType<{
  text: string
  then?: FlowStepSpec[]
}> = z.lazy(() =>
  z
    .object({
      text: z
        .string()
        .trim()
        .min(1)
        .refine(
          (value) => countMessageCharacters(value) <= BUTTON_LABEL_MAX,
          flowValidationCodes.constraintExceeded,
        )
        .meta({
          description: `Button label shown to the contact (max ${BUTTON_LABEL_MAX} characters).`,
          maxLength: BUTTON_LABEL_MAX,
        }),
      // DSL vocabulary ("steps to run then"), not an accidental thenable — the
      // value is an array, never callable, so nothing ever treats this object
      // as a Promise.
      // biome-ignore lint/suspicious/noThenProperty: see comment above
      then: z
        .array(flowStepSpecSchema)
        .optional()
        .describe(
          "Steps to run when the contact taps this button. Omitted or empty means the button has no follow-up.",
        ),
    })
    .describe("A quick-reply button attached to a send step."),
)

const sendStepSpecSchema = z
  .object({
    type: stepTypeLiteral("send"),
    id: stepIdField,
    text: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => countMessageCharacters(value) <= MAX_SPEC_TEXT_LENGTH,
        flowValidationCodes.constraintExceeded,
      )
      .optional()
      .meta({
        description: `Text message body (max ${MAX_SPEC_TEXT_LENGTH} characters). Exactly one of text/imageUrl/fileUrl is required.`,
        maxLength: MAX_SPEC_TEXT_LENGTH,
      }),
    imageUrl: z
      .url()
      .optional()
      .describe(
        "Image URL to send. Exactly one of text/imageUrl/fileUrl is required.",
      ),
    fileUrl: z
      .url()
      .optional()
      .describe(
        "File URL to send. Exactly one of text/imageUrl/fileUrl is required.",
      ),
    buttons: z
      .array(sendButtonSpecSchema)
      .max(MAX_SPEC_BUTTONS)
      .optional()
      .describe(
        `Up to ${MAX_SPEC_BUTTONS} quick-reply buttons attached to this message.`,
      ),
  })
  .superRefine((data, ctx) => {
    const kinds = [data.text, data.imageUrl, data.fileUrl].filter(
      (value) => value !== undefined,
    )
    if (kinds.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Exactly one of text, imageUrl, or fileUrl is required.",
        path: [],
      })
    }
  })
  .describe(
    "Sends one message (text, image, or file), optionally with quick-reply buttons.",
  )

const sendTemplateStepSpecSchema = z
  .object({
    type: stepTypeLiteral("sendTemplate"),
    id: stepIdField,
    templateName: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Name of an existing WhatsApp message template whose status is `APPROVED` (see `capabilities.get`'s `templates` list). Sent as-is, without dynamic variables.",
      ),
  })
  .describe("Sends an existing WhatsApp message template.")

const sendProductsStepSpecSchema = z
  .object({
    type: stepTypeLiteral("sendProducts"),
    id: stepIdField,
    display: sendProductsDisplays.describe(
      'How the products are shown. "products": one product, or several grouped in `sections`. "carousel": 2+ products as scrollable cards (one section, `body` only). Which displays and text limits a channel supports is in `capabilities.get`.',
    ),
    header: z.string().trim().optional().describe("Header text."),
    body: z.string().trim().optional().describe("Message text."),
    footer: z.string().trim().optional().describe("Footer text."),
    sections: z
      .array(
        z.object({
          title: z.string().trim().optional().describe("Section title."),
          productIds: z
            .array(zodBigintAsString())
            .describe(
              "Product ids, from `products.listSendable`. A product may appear only once in the whole message.",
            ),
        }),
      )
      .optional()
      .describe(
        'Product sections. Needed for "products" and "carousel" (exactly one section).',
      ),
  })
  .describe(
    "Sends products from the workspace catalog (single product, product list or carousel; use sendViewCatalog to open the whole catalog). Only on channels that support product messages.",
  )

const sendViewCatalogStepSpecSchema = z
  .object({
    type: stepTypeLiteral("sendViewCatalog"),
    id: stepIdField,
    // Reused from the step itself so the DSL and the compiled step can never
    // disagree on limits or wording.
    text: sendViewCatalogStepSchema.shape.text,
    footer: sendViewCatalogStepSchema.shape.footer,
    thumbnailProductId: sendViewCatalogStepSchema.shape.thumbnailProductId,
  })
  .describe(
    "Shares the product catalog: a message with a button that opens it. Publish rejects it on channels that cannot deliver it (see `capabilities.get`'s `unsupportedSteps`); in an omnichannel flow (`channel` omitted) it is accepted but only sent to WhatsApp contacts, so set `channel` to check it at publish.",
  )

const waitStepSpecSchema = z
  .object({
    type: stepTypeLiteral("wait"),
    id: stepIdField,
    duration: z
      .number()
      .int()
      .positive()
      .describe("How long to wait, in `unit`s."),
    unit: waitStepDelayUnits.describe("Unit for `duration`."),
  })
  .describe("Pauses the flow for a fixed duration before continuing.")

const branchConditionSpecSchema = z
  .object({
    field: z
      .string()
      .min(1)
      .describe(
        "A static field name from `GET /v1/contacts/filter-fields`, or `customField:<name>` to reference a workspace custom field by name (resolved automatically — use the exact name from `contacts.listFilterFields`). `botField:` prefixed names are rejected by the compiler with error code `invalidSpec`; bot fields are reference-only data.",
      ),
    operator: z
      .string()
      .min(1)
      .describe(
        "One of the operators `GET /v1/contacts/filter-fields` lists for this field.",
      ),
    value: z
      .union([
        z.string(),
        z.array(z.string()),
        z.tuple([z.string(), z.string()]),
      ])
      .optional()
      .describe(
        "Comparison value. Omit for valueless operators (e.g. isEmpty/isNotEmpty). A two-element tuple is a between-range.",
      ),
  })
  .describe("One contact-filter-style condition for a branch case.")

const branchCaseSpecSchema: z.ZodType<{
  match?: "and" | "or"
  when: Array<{
    field: string
    operator: string
    value?: string | string[] | [string, string]
  }>
  then: FlowStepSpec[]
}> = z.lazy(() =>
  z
    .object({
      match: z
        .enum(["and", "or"])
        .default("and")
        .describe(
          "Whether every ('and') or any ('or') condition in `when` must match.",
        ),
      when: z
        .array(branchConditionSpecSchema)
        .min(1)
        .describe(
          "Conditions evaluated to determine whether this case matches.",
        ),
      // DSL vocabulary, see the identical note on the button step's `then`
      // above.
      // biome-ignore lint/suspicious/noThenProperty: see comment above
      then: z
        .array(flowStepSpecSchema)
        .min(1)
        .describe("Steps to run when this case matches."),
    })
    .describe("One ordered case in a branch step."),
)

const branchStepSpecSchema = z
  .object({
    type: stepTypeLiteral("branch"),
    id: stepIdField,
    cases: z
      .array(branchCaseSpecSchema)
      .min(1)
      .describe("Ordered cases evaluated until one matches."),
    otherwise: z
      .array(z.lazy(() => flowStepSpecSchema))
      .optional()
      .describe("Steps to run when no case matches."),
  })
  .describe(
    "Splits the flow by contact-filter-style conditions. Terminal within its step list — nothing may follow a `branch` at the same level; continue inside `cases[].then` / `otherwise` instead.",
  )

const actionStepSpecSchema = z
  .object({
    type: stepTypeLiteral("action"),
    id: stepIdField,
    action: z
      .enum([
        "addTags",
        "removeTags",
        "setCustomField",
        "assignConversation",
        "archiveConversation",
      ])
      .describe("Which workspace action to perform."),
    tagNames: z
      .array(z.string().trim().min(1))
      .optional()
      .describe("Tag names. Required for `addTags`/`removeTags`."),
    customFieldName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Custom field name. Required for `setCustomField`."),
    value: z
      .string()
      .optional()
      .describe("Value to set. Required for `setCustomField`."),
    assigneeId: z
      .string()
      .optional()
      .describe(
        "Workspace member id to assign the conversation to. Optional for `assignConversation`; omit to unassign.",
      ),
  })
  .superRefine((data, ctx) => {
    if (
      (data.action === "addTags" || data.action === "removeTags") &&
      (!data.tagNames || data.tagNames.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `action "${data.action}" requires a non-empty tagNames`,
        path: ["tagNames"],
      })
    }
    if (data.action === "setCustomField") {
      if (!data.customFieldName) {
        ctx.addIssue({
          code: "custom",
          message: 'action "setCustomField" requires customFieldName',
          path: ["customFieldName"],
        })
      }
      if (data.value === undefined) {
        ctx.addIssue({
          code: "custom",
          message: 'action "setCustomField" requires value',
          path: ["value"],
        })
      }
    }
  })
  .describe(
    "Performs a workspace side-effect: tag, custom field, or conversation action.",
  )

/** Spec fields each pipeline action accepts (besides type/id/action/pipeline/onError/onSkip). */
const PIPELINE_ACTION_FIELDS = {
  addToPipeline: {
    required: [],
    optional: [
      "title",
      "description",
      "status",
      "stage",
      "assigneeMemberIds",
      "assigneeInboxTeamIds",
      "dueDate",
      "fieldValues",
    ],
  },
  moveToStage: { required: ["stage"], optional: [] },
  changeValue: { required: ["value"], optional: [] },
  assign: {
    required: [],
    optional: ["assigneeMemberIds", "assigneeInboxTeamIds"],
    // The runtime rejects an assign with nobody to assign (flow-actions.ts).
    requireOneOf: ["assigneeMemberIds", "assigneeInboxTeamIds"],
  },
  changeStatus: { required: ["status"], optional: [] },
  changePriority: { required: ["priority"], optional: [] },
  changeDueDate: { required: ["dueDate"], optional: [] },
  changeTitle: { required: ["title"], optional: [] },
  setCustomField: { required: ["field", "value"], optional: [] },
  clearCustomField: { required: ["fields"], optional: [] },
  changeDescription: { required: ["description"], optional: [] },
  removeFromPipeline: { required: [], optional: [] },
  addComment: { required: ["text"], optional: [] },
  transfer: {
    required: ["destinationPipeline"],
    optional: ["destinationStage"],
  },
} as const satisfies Record<
  z.infer<typeof pipelineStepActions>,
  {
    required: readonly string[]
    optional: readonly string[]
    /** At least one of these must be present and non-empty. */
    requireOneOf?: readonly string[]
  }
>

const PIPELINE_ACTION_SPECIFIC_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "stage",
  "assigneeMemberIds",
  "assigneeInboxTeamIds",
  "dueDate",
  "fieldValues",
  "value",
  "field",
  "fields",
  "text",
  "destinationPipeline",
  "destinationStage",
] as const

const pipelineDueDateSpecSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("none").describe("No due date.") }),
    z.object({
      mode: z.literal("fixed").describe("A fixed instant."),
      at: z.iso.datetime({ offset: true }).describe("Fixed ISO-8601 instant."),
    }),
    z.object({
      mode: z
        .literal("customField")
        .describe("Read from a contact date custom field."),
      customFieldName: z
        .string()
        .trim()
        .min(1)
        .describe(
          "Name of a contact custom field of type date or datetime (see `contacts.listCustomFields`); a blank value clears the due date.",
        ),
    }),
  ])
  .describe(
    'Due date: `{ mode: "none" }` leaves/clears it, `{ mode: "fixed", at }` sets an instant, `{ mode: "customField", customFieldName }` reads it from a contact date custom field.',
  )

const pipelineMemberIdsSpec = zodBigintIdAsString()
  .array()
  .max(PIPELINE_STEP_LIMITS.assignees)

const pipelineStepSpecSchema = z
  .object({
    type: stepTypeLiteral("pipeline"),
    id: stepIdField,
    action: pipelineStepActions.describe(
      "Which pipeline action to run. Every action except `addToPipeline` acts on the contact's most recently created OPEN item in `pipeline`; with no open item the step takes the `onSkip` path.",
    ),
    pipeline: z
      .string()
      .trim()
      .min(1)
      .describe(
        "The pipeline, by `referenceName` (or id). Get both from `pipelines.list` / `pipelines.get`.",
      ),
    title: z
      .string()
      .max(PIPELINE_STEP_LIMITS.title)
      .optional()
      .describe(
        "Item title; accepts {{variables}}. `addToPipeline` (default `{{full_name}}`), `changeTitle` (required).",
      ),
    description: z
      .string()
      .max(PIPELINE_STEP_LIMITS.description)
      .optional()
      .describe(
        "Item description. `addToPipeline` (optional), `changeDescription` (required; empty clears it).",
      ),
    status: z
      .enum(["open", "won", "lost"])
      .optional()
      .describe(
        "Item status. `addToPipeline` (default open), `changeStatus` (required).",
      ),
    priority: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("Item priority. Required for `changePriority`."),
    stage: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Stage NAME within `pipeline` (from `pipelines.get`). Required for `moveToStage`; optional for `addToPipeline` (default: the first stage). Rejected as ambiguous when two stages share the name.",
      ),
    assigneeMemberIds: pipelineMemberIdsSpec
      .optional()
      .describe(
        "Workspace member ids to assign (from `workspaceMembers.list`). `addToPipeline`, `assign` (replaces the assignees).",
      ),
    assigneeInboxTeamIds: pipelineMemberIdsSpec
      .optional()
      .describe(
        "Inbox team ids to assign (from `inboxTeams.list`). `addToPipeline`, `assign` (replaces the teams).",
      ),
    dueDate: pipelineDueDateSpecSchema
      .optional()
      .describe(
        "Due date. `changeDueDate` (required), `addToPipeline` (default none).",
      ),
    fieldValues: z
      .array(
        z.object({
          field: z
            .string()
            .trim()
            .min(1)
            .describe("Pipeline custom field `referenceName`."),
          value: z.string().describe("Value; accepts {{variables}}."),
        }),
      )
      .max(PIPELINE_STEP_LIMITS.maxFieldIds)
      .optional()
      .describe(
        "Pipeline custom field values set on the new item (`addToPipeline`).",
      ),
    value: z
      .string()
      .optional()
      .describe(
        "`changeValue`: opportunity value, a number >= 0 ({{variables}} allowed). `setCustomField`: the field value.",
      ),
    field: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Pipeline custom field `referenceName` (from `pipelines.get`). Required for `setCustomField`.",
      ),
    fields: z
      .array(z.string().trim().min(1))
      .max(PIPELINE_STEP_LIMITS.maxFieldIds)
      .optional()
      .describe(
        "Pipeline custom field `referenceName`s to clear. Required (non-empty) for `clearCustomField`.",
      ),
    text: z
      .string()
      .max(PIPELINE_STEP_LIMITS.comment)
      .optional()
      .describe(
        "Comment text; accepts {{variables}}. Required for `addComment`.",
      ),
    destinationPipeline: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Target pipeline, by `referenceName` (or id). Required for `transfer`.",
      ),
    destinationStage: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Stage NAME in `destinationPipeline`. Optional for `transfer` (default: its first stage).",
      ),
    onError: z
      .array(z.lazy(() => flowStepSpecSchema))
      .optional()
      .describe(
        "Steps to run when the action fails (invalid input, unknown pipeline/stage, conflict). Omitted: the flow continues to the next step.",
      ),
    onSkip: z
      .array(z.lazy(() => flowStepSpecSchema))
      .optional()
      .describe(
        "Steps to run when the contact has no open item in `pipeline`. Not allowed for `addToPipeline`, which never skips.",
      ),
  })
  .superRefine((data, ctx) => {
    const rules = PIPELINE_ACTION_FIELDS[data.action]
    const allowed = new Set<string>([...rules.required, ...rules.optional])
    for (const key of PIPELINE_ACTION_SPECIFIC_FIELDS) {
      if (data[key] !== undefined && !allowed.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `action "${data.action}" does not accept ${key}`,
          path: [key],
        })
      }
    }
    for (const key of rules.required) {
      const value = (data as Record<string, unknown>)[key]
      const isEmptyList = Array.isArray(value) && value.length === 0
      if (value === undefined || isEmptyList) {
        ctx.addIssue({
          code: "custom",
          message: `action "${data.action}" requires ${key}${isEmptyList ? " to be non-empty" : ""}`,
          path: [key],
        })
      }
    }
    const oneOf: readonly string[] =
      "requireOneOf" in rules ? rules.requireOneOf : []
    const hasValue = (key: string) => {
      const value = (data as Record<string, unknown>)[key]
      return Array.isArray(value) ? value.length > 0 : value !== undefined
    }
    if (oneOf.length > 0 && !oneOf.some(hasValue)) {
      ctx.addIssue({
        code: "custom",
        message: `action "${data.action}" requires at least one of ${oneOf.join(", ")}`,
        path: [oneOf[0] ?? "action"],
      })
    }
    if (data.onSkip !== undefined && !pipelineActionCanSkip(data.action)) {
      ctx.addIssue({
        code: "custom",
        message: `action "${data.action}" never skips, so onSkip would never run`,
        path: ["onSkip"],
      })
    }
  })
  .describe(
    "Runs a Pipelines (CRM kanban) action for the contact: addToPipeline, moveToStage, changeValue, assign, changeStatus, changePriority, changeDueDate, changeTitle, setCustomField, clearCustomField, changeDescription, removeFromPipeline, addComment or transfer. Pipelines, stages and fields are referenced by name/referenceName (see `pipelines.list` / `pipelines.get`). Success continues to the next step; `onError` / `onSkip` hold the steps for those outcomes.",
  )

const startFlowStepSpecSchema = z
  .object({
    type: stepTypeLiteral("startFlow"),
    id: stepIdField,
    flowName: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Name of another existing flow in this workspace (see `flows.list`).",
      ),
  })
  .describe(
    "Starts another flow for the contact; this flow keeps running afterward (an ordinary step may follow).",
  )

const addNoteStepSpecSchema = z
  .object({
    type: stepTypeLiteral("addNote"),
    id: stepIdField,
    note: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => countMessageCharacters(value) <= MAX_SPEC_TEXT_LENGTH,
        flowValidationCodes.constraintExceeded,
      )
      .meta({
        description: `Internal note text (max ${MAX_SPEC_TEXT_LENGTH} characters) — never shown to the contact.`,
        maxLength: MAX_SPEC_TEXT_LENGTH,
      }),
  })
  .describe("Adds an internal note to the conversation.")

const gotoStepSpecSchema = z
  .object({
    type: stepTypeLiteral("goto"),
    targetId: z
      .string()
      .min(1)
      .describe(
        "The `id` of an earlier step in this flow spec to jump to, instead of continuing linearly.",
      ),
  })
  .describe(
    "Terminal — routes to an already-defined step instead of continuing. Must be the last step in its list.",
  )

const flowStepSpecOptions = [
  sendStepSpecSchema,
  sendTemplateStepSpecSchema,
  sendProductsStepSpecSchema,
  sendViewCatalogStepSpecSchema,
  waitStepSpecSchema,
  branchStepSpecSchema,
  actionStepSpecSchema,
  pipelineStepSpecSchema,
  startFlowStepSpecSchema,
  addNoteStepSpecSchema,
  gotoStepSpecSchema,
] as const

const flowStepSpecSchema: z.ZodType<FlowStepSpec> = z
  .discriminatedUnion("type", flowStepSpecOptions)
  .describe(
    "One flow step. The `type` field selects the step kind: send, sendTemplate, sendProducts, sendViewCatalog, wait, branch, action, pipeline, startFlow, addNote or goto.",
  )

export type FlowSpecStepType = { type: string; description: string }

/**
 * Derived from each step schema's own `.describe()` — the same text `GET
 * /v1/schemas/flow-spec` surfaces — rather than a hand-maintained list that
 * can silently drift from the schema.
 */
export const flowSpecStepTypes: FlowSpecStepType[] = flowStepSpecOptions.map(
  (option) => ({
    type: option.shape.type.value,
    description: option.description ?? "",
  }),
)

export const flowSpecSchema = z
  .object({
    formatVersion: z.literal(1).describe("DSL format version. Always 1."),
    name: z
      .string()
      .trim()
      .min(1)
      .max(MAX_FLOW_NAME_LENGTH)
      .describe(`Flow name (max ${MAX_FLOW_NAME_LENGTH} characters).`),
    channel: channelTypes
      .optional()
      .describe(
        "Channel this flow targets. Omit for any/omnichannel. sendTemplate steps always send over WhatsApp regardless of this value.",
      ),
    steps: z
      .array(flowStepSpecSchema)
      .min(1)
      .describe("Ordered steps executed from the flow's start node."),
  })
  .describe("A complete agent-authored flow DSL document.")
export type FlowSpec = z.infer<typeof flowSpecSchema>
