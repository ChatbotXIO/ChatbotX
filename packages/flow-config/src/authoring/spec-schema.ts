import { channelTypes } from "@chatbotx.io/utils/channel"
import { z } from "zod"
import { BUTTON_LABEL_MAX } from "../steps/button"
import { waitStepDelayUnits } from "../steps/wait"

const MAX_SPEC_BUTTONS = 3
const MAX_SPEC_TEXT_LENGTH = 1000
const MAX_FLOW_NAME_LENGTH = 255

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
        .max(BUTTON_LABEL_MAX)
        .describe(
          `Button label shown to the contact (max ${BUTTON_LABEL_MAX} characters).`,
        ),
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
      .max(MAX_SPEC_TEXT_LENGTH)
      .optional()
      .describe(
        `Text message body (max ${MAX_SPEC_TEXT_LENGTH} characters). Exactly one of text/imageUrl/fileUrl is required.`,
      ),
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
      .max(MAX_SPEC_TEXT_LENGTH)
      .describe(
        `Internal note text (max ${MAX_SPEC_TEXT_LENGTH} characters) — never shown to the contact.`,
      ),
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
  waitStepSpecSchema,
  branchStepSpecSchema,
  actionStepSpecSchema,
  startFlowStepSpecSchema,
  addNoteStepSpecSchema,
  gotoStepSpecSchema,
] as const

const flowStepSpecSchema: z.ZodType<FlowStepSpec> = z.discriminatedUnion(
  "type",
  flowStepSpecOptions,
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
