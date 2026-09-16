import {
  edgeSchema,
  flowSpecSchema,
  flowVersionSchema,
  refineStepsByChannel,
} from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createFlowSchema = z.object({
  folderId: zodBigintAsString()
    .nullable()
    .describe(
      "Folder id (numeric string) to create the flow in, or null for no folder.",
    ),
  name: z.string().trim().min(1).max(255).describe("Flow name."),
})
export type CreateFlowSchema = z.infer<typeof createFlowSchema>

export const updateFlowSchema = z.object({
  name: z
    .optional(z.string().trim().min(1).max(255))
    .describe("New flow name."),
  active: z.optional(z.boolean()).describe("Whether the flow is active."),
  enableInInbox: z
    .optional(z.boolean())
    .describe("Whether agents can start this flow manually from the inbox."),
})
export type UpdateFlowSchema = z.infer<typeof updateFlowSchema>

// `publishFlowRequest`/`updateDraftFlowRequest` also intersect this schema
// with `publicIdParam(...)` (`.and()`) at the route, so this cannot be
// `.strict()` — zod validates each union branch against the raw input
// before merging, and a strict branch would reject the legitimate `id` key
// the intersection adds. `z.preprocess` runs on the *raw*, unparsed input
// (before the wrapped schema strips unknown keys), so it can see and reject
// a disallowed sibling key without changing the wrapped schema's own
// inferred output type — unlike `.catchall()` + `.superRefine()`, which
// widens every field's type to include the catchall's `unknown`.
const rejectIfKeysPresent = <T extends z.ZodType>(
  keys: readonly string[],
  label: string,
  schema: T,
): T =>
  z.preprocess((raw, ctx) => {
    if (raw && typeof raw === "object") {
      const present = keys.filter((key) => key in raw)
      if (present.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Cannot combine ${present.map((key) => `"${key}"`).join("/")} with ${label} in the same request body.`,
        })
        return z.NEVER
      }
    }
    return raw
  }, schema) as unknown as T

export const updateDraftFlowVersionSchema = rejectIfKeysPresent(
  ["spec"],
  '"nodes"/"edges"',
  z.object({
    nodes: z
      .array(z.any())
      .describe("Raw flow node graph, as sent by the builder UI."),
    edges: z
      .array(edgeSchema)
      .describe("Raw flow edge graph, as sent by the builder UI."),
  }),
)
export type UpdateDraftFlowVersionSchema = z.infer<
  typeof updateDraftFlowVersionSchema
>

/** `{ spec }` input, accepted by `flows.publish`/`flows.updateDraft` alongside the raw `{ nodes, edges }` shape, and the sole input of `flows.validate`. */
export const flowSpecRequest = rejectIfKeysPresent(
  ["nodes", "edges"],
  '"spec"',
  z.object({
    spec: flowSpecSchema,
  }),
)

// `flowSpecRequest` is listed first so a body that happens to satisfy both
// shapes resolves to the spec branch; the `rejectIfKeysPresent` guards on
// every branch are the primary protection — a mixed `{ spec, nodes, edges }`
// body fails all of them and zod reports the union mismatch as a 422
// instead of silently discarding `spec` (or `nodes`/`edges`).
/** Draft update accepts either the raw graph the builder UI sends, or a `{ spec }` an agent authored. */
export const updateDraftFlowRequest = z.union([
  flowSpecRequest,
  updateDraftFlowVersionSchema,
])

// Channel rules are declared per step (see
// `@chatbotx.io/flow-config/channel-rules`), so this stays one generic hook
// instead of accumulating a refinement per channel/step pair.
export const publishFlowSchema = rejectIfKeysPresent(
  ["spec"],
  '"nodes"/"edges"',
  z.object({
    nodes: z
      .array(flowVersionSchema)
      .superRefine(refineStepsByChannel)
      .describe("Raw flow node graph, as sent by the builder UI."),
    edges: z
      .array(edgeSchema)
      .describe("Raw flow edge graph, as sent by the builder UI."),
  }),
)
export type PublishFlowSchema = z.infer<typeof publishFlowSchema>

/** Publish accepts either the raw graph the builder UI sends, or a `{ spec }` an agent authored — compiled server-side into the same graph shape before publishing. */
export const publishFlowRequest = z.union([flowSpecRequest, publishFlowSchema])

// Reuse the package-level node union so client-side publish validation can
// never drift from the server-side `publishFlowSchema` when node types are added.
export const updateFlowVersionSchema = publishFlowSchema
export type UpdateFlowVersionSchema = z.infer<typeof updateFlowVersionSchema>

export const selectFlowSchema = z.object({
  flowId: z.string(),
})
export type SelectFlowSchema = z.infer<typeof selectFlowSchema>

export const importFlowRequest = z.object({
  fileId: zodBigintAsString(),
  folderId: zodBigintAsString().nullable(),
})
export type ImportFlowRequest = z.infer<typeof importFlowRequest>

export type ImportFlowResponse = {
  importId: string
}
