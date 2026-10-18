import { decisionConnectionSafeSchema } from "@chatbotx.io/business"
import { z } from "zod"
import { decisionConnectionActionSchema } from "./action"

/** A credential-safe connection projection for workspace-token callers. */
export const publicDecisionConnectionSchema = decisionConnectionSafeSchema

const publicDecisionConnectionFields = {
  defaultModel: decisionConnectionActionSchema.shape.defaultModel.describe(
    "Default provider model. It must be included in `modelCatalog`, or null to use the first catalog model.",
  ),
  endpoint: decisionConnectionActionSchema.shape.endpoint.describe(
    "Provider endpoint, or null when the provider kind has a built-in endpoint.",
  ),
  modelCatalog: decisionConnectionActionSchema.shape.modelCatalog.describe(
    "Provider model ids available to profiles using this connection.",
  ),
  name: decisionConnectionActionSchema.shape.name.describe(
    "Human-readable connection name.",
  ),
  providerKind: decisionConnectionActionSchema.shape.providerKind.describe(
    "Provider protocol used for the connection.",
  ),
}

export const createPublicDecisionConnectionSchema =
  decisionConnectionActionSchema.extend({
    ...publicDecisionConnectionFields,
    credential: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .describe("Provider API credential. Write-only; it is never returned."),
  })

export const updatePublicDecisionConnectionSchema =
  decisionConnectionActionSchema.extend({
    ...publicDecisionConnectionFields,
    credential: decisionConnectionActionSchema.shape.credential.describe(
      "Replacement provider API credential. Omit it to keep the existing secret; it is never returned.",
    ),
  })

export const publicDecisionConnectionStatusSchema = z
  .object({
    enabled: z.boolean().describe("Whether the connection is usable."),
  })
  .strict()

export const publicDecisionConnectionTestResultSchema = z
  .object({
    code: z.string(),
    latencyMs: z.number().int().nonnegative(),
    model: z.string(),
    status: z.enum(["failed", "passed"]),
  })
  .strict()
