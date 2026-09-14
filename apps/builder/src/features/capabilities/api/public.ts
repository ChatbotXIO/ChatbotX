import {
  CAPABILITIES_INCLUDES,
  getCapabilities,
} from "@chatbotx.io/business/capabilities"
import { flowSpecSchema } from "@chatbotx.io/flow-config"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

// Endpoint discovery, not a resource read — reuses the `contacts` scope
// exactly like `GET /v1/contacts/filter-fields` (see
// `features/contact-filter/api/public.ts`): the most common scope, and this
// only ever returns metadata (ids/names), never contact data. `alwaysVisible`
// exempts it from scope-based `tools/list` filtering so a token missing
// `contacts` still sees this tool and its 403, instead of the tool
// disappearing without a trace.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

const namedEntityResponse = z.object({ id: z.string(), name: z.string() })
const fieldResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
})

const capabilitiesPublicResponse = z.object({
  inboxes: z
    .array(z.object({ id: z.string(), name: z.string(), channel: z.string() }))
    .optional(),
  templates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        language: z.string(),
        status: z.string(),
        params: z.unknown(),
      }),
    )
    .optional(),
  customFields: z.array(fieldResponse).optional(),
  botFields: z.array(fieldResponse).optional(),
  tags: z.array(namedEntityResponse).optional(),
  aiAgents: z.array(namedEntityResponse).optional(),
  sequences: z.array(namedEntityResponse).optional(),
  flows: z.array(namedEntityResponse).optional(),
  flowSpec: z
    .object({
      stepTypes: z.array(
        z.object({ type: z.string(), description: z.string() }),
      ),
      waitUnits: z.array(z.string()),
      channels: z.array(z.string()),
    })
    .optional(),
})

const includeQueryParam = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : undefined
}, z.array(z.enum(CAPABILITIES_INCLUDES)).optional())

const flowSpecJsonSchemaConverter = new ZodToJsonSchemaConverter()
// `flowSpecSchema` is static — converted once at module load rather than on
// every `schemas.flowSpec` request.
const [, flowSpecJsonSchema] = flowSpecJsonSchemaConverter.convert(
  flowSpecSchema,
  { strategy: "input" },
)

export const capabilitiesPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/capabilities",
      summary:
        "Discover the workspace's inboxes, templates, fields, tags, sequences, and flows",
      description:
        "Returns compact (id + name, plus a couple of decisive fields) lists of the workspace entities an agent needs to reference by id — inboxes, WhatsApp templates, custom/bot fields, tags, AI agents, sequences, and flows — plus the flow-spec DSL's step types and valid wait units/channels. Use `include` (comma-separated) to narrow the response; omit it for the default set an agent needs to build a flow. Call this before `flows.create`/`flows.publish` so names in a flow spec resolve to real ids instead of guesses.",
      tags: ["Capabilities"],
      spec: mcpSpec({ visibility: "default", alwaysVisible: true }),
    })
    .input(z.object({ include: includeQueryParam }))
    .output(capabilitiesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await getCapabilities({
          workspaceId: context.workspace.id,
          include: input.include,
        }),
    ),
}

export const schemasPublicRouter = {
  flowSpec: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/schemas/flow-spec",
      summary: "Get the JSON Schema for the flow-spec DSL",
      description:
        "Returns the JSON Schema for the `spec` object accepted by `flows.publish`'s `{ spec }` input and `flows.validate` — the authoritative reference for every step type's fields. Use `capabilities.get` first to resolve the names (templates, flows, tags, custom fields) a spec references into real ids.",
      tags: ["Capabilities"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(z.object({}))
    .output(z.record(z.string(), z.unknown()))
    .errors(possibleErrorsOnListingResource)
    .handler(() => flowSpecJsonSchema as Record<string, unknown>),
}
