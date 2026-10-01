import {
  CAPABILITIES_INCLUDES,
  getCapabilities,
} from "@chatbotx.io/business/capabilities"
import { capabilitiesResponseSchema } from "@chatbotx.io/business/capabilities/schema"
import { flowSpecSchema } from "@chatbotx.io/flow-config"
import { channelTypes } from "@chatbotx.io/utils/channel"
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

const includeQueryParam = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value
    }
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    return parts.length > 0 ? parts : undefined
  },
  z
    .array(z.enum(CAPABILITIES_INCLUDES))
    .optional()
    .describe(
      "Comma-separated list of capability categories to include. Omit to get the default set.",
    ),
)

const channelQueryParam = channelTypes
  .optional()
  .describe(
    "Channel to project an explicit flow policy for. Query this before authoring a channel-bound flow.",
  )

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
      summary: "Discover workspace capabilities",
      description:
        "Returns compact workspace reference data and FlowSpec authoring capabilities. Before writing a channel-bound FlowSpec, pass `channel` to receive the selected channel policy, supported block IDs, limits, and Builder/FlowSpec surface flags. Use `include` (comma-separated) to narrow the response; omit it for the default flow-authoring capabilities. Call this before `flows.create`, `flows.publish`, `flows.updateDraft`, or `flows.validate` so referenced names resolve to real workspace entities.",
      tags: ["Capabilities"],
      spec: mcpSpec({ visibility: "default", alwaysVisible: true }),
    })
    .input(z.object({ channel: channelQueryParam, include: includeQueryParam }))
    .output(capabilitiesResponseSchema)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await getCapabilities({
          workspaceId: context.workspace.id,
          include: input.include,
          channel: input.channel,
        }),
    ),
}

export const schemasPublicRouter = {
  flowSpec: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/schemas/flow-spec",
      summary: "Get JSON Schema for flow-spec DSL",
      description:
        "Returns the JSON Schema for the `spec` object accepted by `flows.create`'s, `flows.publish`'s, `flows.updateDraft`'s, and `flows.validate`'s `{ spec }` input — the authoritative reference for every step type's fields. Use `capabilities.get` first to resolve the names (templates, flows, tags, custom fields) a spec references into real ids.",
      tags: ["Capabilities"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(z.object({}))
    .output(z.record(z.string(), z.unknown()))
    .errors(possibleErrorsOnListingResource)
    .handler(() => flowSpecJsonSchema as Record<string, unknown>),
}
