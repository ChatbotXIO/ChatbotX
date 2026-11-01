import { z } from "zod"

export const aiFileChunkStrategies = z.enum(["prose", "tabular", "markdown"])
export type AIFileChunkStrategy = z.infer<typeof aiFileChunkStrategies>

// Bump a strategy version whenever its chunk format or algorithm changes.
// Reindex consumers use this to detect files that need processing again.
export const AI_FILE_CHUNKER_VERSIONS = {
  prose: 1,
  tabular: 1,
  markdown: 1,
} as const satisfies Record<AIFileChunkStrategy, number>

export const aiFileChunking = z.strictObject({
  strategy: aiFileChunkStrategies,
  chunkerVersion: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  overlapSize: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  processedAt: z.iso.datetime(),
  // Optional so rows written before it existed still parse. Total characters
  // handed to the chunker; lets the UI estimate a chunk count for new settings.
  extractedChars: z.number().int().nonnegative().optional(),
})
export type AIFileChunking = z.infer<typeof aiFileChunking>

export const AI_FILE_CHUNKING_LIMITS = {
  // 2000 chars stays inside gemini-embedding-001's 2048-token input even for
  // CJK and Thai text (about one token per character); an oversized chunk
  // would fail at embed time and leave the file stuck in processing.
  // Structured chunkers refuse sizes below 100.
  chunkSize: { min: 200, max: 2000, default: 1000 },
  overlapSize: { max: 500, default: 200 },
  tabularHeaderRow: { min: 1, max: 20, default: 1 },
} as const

export const aiFileChunkingConfigStrategies = z.enum(["auto", "prose"])
export type AIFileChunkingConfigStrategy = z.infer<
  typeof aiFileChunkingConfigStrategies
>

// Per-file chunking parameters chosen by an admin. Every key is optional and
// `NULL` in the column means "today's defaults". Later keys must be optional
// so stored rows keep parsing.
export const aiFileChunkingConfig = z.strictObject({
  strategy: aiFileChunkingConfigStrategies.optional(),
  chunkSize: z
    .number()
    .int()
    .min(AI_FILE_CHUNKING_LIMITS.chunkSize.min)
    .max(AI_FILE_CHUNKING_LIMITS.chunkSize.max)
    .optional(),
  overlapSize: z
    .number()
    .int()
    .min(0)
    .max(AI_FILE_CHUNKING_LIMITS.overlapSize.max)
    .optional(),
  tabularHeaderRow: z
    .number()
    .int()
    .min(AI_FILE_CHUNKING_LIMITS.tabularHeaderRow.min)
    .max(AI_FILE_CHUNKING_LIMITS.tabularHeaderRow.max)
    .optional(),
})
export type AIFileChunkingConfig = z.infer<typeof aiFileChunkingConfig>

export type ResolvedAIFileChunkingConfig = Required<AIFileChunkingConfig>

/**
 * Fills defaults and clamps a stored config. A malformed value (the column is
 * plain jsonb) resolves to the defaults rather than failing the job.
 */
export function resolveAIFileChunkingConfig(
  config: unknown,
): ResolvedAIFileChunkingConfig {
  const parsed = aiFileChunkingConfig.safeParse(config)
  const value = parsed.success ? parsed.data : {}
  const limits = AI_FILE_CHUNKING_LIMITS
  const chunkSize = Math.min(
    limits.chunkSize.max,
    Math.max(limits.chunkSize.min, value.chunkSize ?? limits.chunkSize.default),
  )
  const overlapSize = Math.min(
    limits.overlapSize.max,
    Math.floor(chunkSize / 2),
    Math.max(0, value.overlapSize ?? limits.overlapSize.default),
  )
  return {
    strategy: value.strategy ?? "auto",
    chunkSize,
    overlapSize,
    tabularHeaderRow: Math.min(
      limits.tabularHeaderRow.max,
      Math.max(
        limits.tabularHeaderRow.min,
        value.tabularHeaderRow ?? limits.tabularHeaderRow.default,
      ),
    ),
  }
}

/**
 * Rough chunk count for new settings, shown before a reindex. Prose slides a
 * window by `chunkSize - overlap`; tabular and markdown pack whole rows or
 * sections, so overlap does not apply.
 */
export function estimateAIFileChunkCount(input: {
  strategy: AIFileChunkStrategy
  extractedChars: number
  chunkSize: number
  overlapSize: number
}): number {
  if (input.extractedChars <= 0) {
    return 0
  }
  if (input.strategy === "prose") {
    const step = Math.max(1, input.chunkSize - input.overlapSize)
    return Math.max(
      1,
      Math.ceil((input.extractedChars - input.overlapSize) / step),
    )
  }
  return Math.max(1, Math.ceil(input.extractedChars / input.chunkSize))
}

export const aiFileProcessingRunStatuses = z.enum([
  "queued",
  "processing",
  "success",
  "error",
])
export type AIFileProcessingRunStatus = z.infer<
  typeof aiFileProcessingRunStatuses
>

export const aiFileProcessingRunErrorCodes = z.enum([
  "fileTooLarge",
  "tooManyChunks",
  "fileUnreadable",
  "noExtractableContent",
  "noEmbeddingProvider",
  "enqueueFailed",
  "unknown",
])
export type AIFileProcessingRunErrorCode = z.infer<
  typeof aiFileProcessingRunErrorCodes
>

// A queued/processing run without a heartbeat this long is replaceable. All
// timestamps are Date#toISOString() UTC strings: repository claim queries
// compare them lexically, so offsets other than Z must never be accepted.
export const AI_FILE_PROCESSING_RUN_STALE_MS = 60 * 60 * 1000

export const aiFileProcessingRun = z.strictObject({
  id: z.string().min(1),
  status: aiFileProcessingRunStatuses,
  error: aiFileProcessingRunErrorCodes.nullable(),
  queuedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  heartbeatAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
})
export type AIFileProcessingRun = z.infer<typeof aiFileProcessingRun>

export const aiMcpServerAuthTypes = z.enum(["none", "token", "header"])
export type AIMcpServerAuthType = z.infer<typeof aiMcpServerAuthTypes>

export const aiMessageRoles = z.enum([
  "user",
  "assistant",
  "system",
  "developer",
])
export type AIMessageRole = z.infer<typeof aiMessageRoles>

export const aiEmbeddingStatuses = z.enum([
  "pending",
  "success",
  "error",
  "processing",
])
export type AIEmbeddingStatus = z.infer<typeof aiEmbeddingStatuses>

export const aiConversationSourceTypes = z.enum([
  "document",
  "image",
  "url",
  "web_search",
])
export type AIConversationSourceType = z.infer<typeof aiConversationSourceTypes>

export const aiConversationSourceStatuses = z.enum([
  "pending",
  "processing",
  "success",
  "error",
])
export type AIConversationSourceStatus = z.infer<
  typeof aiConversationSourceStatuses
>

export const aiAgentProviders = z.enum([
  "openai",
  "gemini",
  "claude",
  "deepseek",
  "openrouter",
  "muse",
])
export type AIAgentProvider = z.infer<typeof aiAgentProviders>

export const aiAgentProviderModel = z.object({
  provider: aiAgentProviders,
  model: z.string().trim().min(1),
})
export type AIAgentProviderModel = z.infer<typeof aiAgentProviderModel>

export const aiAgentOpenaiCompatibleProviderModel = z.object({
  kind: z.literal("openaiCompatible"),
  integrationId: z.string().trim().min(1),
  model: z.string().trim().min(1),
})
export type AIAgentOpenaiCompatibleProviderModel = z.infer<
  typeof aiAgentOpenaiCompatibleProviderModel
>

export const aiAgentModelConfig = z.union([
  aiAgentProviderModel,
  aiAgentOpenaiCompatibleProviderModel,
])
export type AIAgentModelConfig = z.infer<typeof aiAgentModelConfig>

export const aiAgentProviderModels = z.array(aiAgentModelConfig).catch([])
export type AIAgentProviderModels = z.infer<typeof aiAgentProviderModels>

/**
 * Persisted actions available to an AI agent. These are deliberately kept in
 * the database partial (rather than the builder) because the worker executes
 * the same untrusted JSON configuration at runtime.
 */
export const aiAgentActionTypes = z.enum([
  "send_flow",
  "assign_conversation",
  "remove_assignment",
  "transfer_to_human",
  "add_tag",
  "remove_tag",
  "set_custom_field",
  "clear_custom_field",
  "mark_follow_up",
  "remove_follow_up",
  "transfer_to_bot",
  "archive",
  "block_contact",
])
export type AIAgentActionType = z.infer<typeof aiAgentActionTypes>

const aiAgentActionIdSchema = z.string().trim().min(1).max(128)

const aiAgentActionBase = z.object({ id: aiAgentActionIdSchema }).strict()

const aiAgentAssignConversationActionSchema = z.union([
  aiAgentActionBase
    .extend({
      type: z.literal("assign_conversation"),
      assignedId: z
        .string()
        .trim()
        .regex(/^[ut]_\S+$/),
    })
    .strict(),
  // Existing rules stored administrator ids without the shared `u_` prefix.
  // Keep parsing them so editing an agent never makes a valid stored rule
  // unreadable; newly created rules always use `assignedId`.
  aiAgentActionBase
    .extend({
      type: z.literal("assign_conversation"),
      adminId: z.string().trim().min(1),
    })
    .strict(),
])

export const aiAgentActionSchema = z.union([
  aiAgentActionBase
    .extend({ type: z.literal("send_flow"), flowId: z.string().trim().min(1) })
    .strict(),
  aiAgentAssignConversationActionSchema,
  aiAgentActionBase.extend({ type: z.literal("remove_assignment") }).strict(),
  aiAgentActionBase.extend({ type: z.literal("transfer_to_human") }).strict(),
  aiAgentActionBase
    .extend({ type: z.literal("add_tag"), tagId: z.string().trim().min(1) })
    .strict(),
  aiAgentActionBase
    .extend({ type: z.literal("remove_tag"), tagId: z.string().trim().min(1) })
    .strict(),
  aiAgentActionBase
    .extend({
      type: z.literal("set_custom_field"),
      customFieldId: z.string().trim().min(1),
    })
    .strict(),
  aiAgentActionBase
    .extend({
      type: z.literal("clear_custom_field"),
      customFieldId: z.string().trim().min(1),
    })
    .strict(),
  aiAgentActionBase.extend({ type: z.literal("mark_follow_up") }).strict(),
  aiAgentActionBase.extend({ type: z.literal("remove_follow_up") }).strict(),
  aiAgentActionBase.extend({ type: z.literal("transfer_to_bot") }).strict(),
  aiAgentActionBase.extend({ type: z.literal("archive") }).strict(),
  aiAgentActionBase.extend({ type: z.literal("block_contact") }).strict(),
])
export type AIAgentAction = z.infer<typeof aiAgentActionSchema>

export const aiAgentActionRuleSchema = z
  .object({
    id: aiAgentActionIdSchema,
    when: z.string().trim().min(1).max(2000),
    actions: z.array(aiAgentActionSchema).min(1).max(15),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const ids = new Set<string>()
    for (const [index, action] of rule.actions.entries()) {
      if (ids.has(action.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Action IDs must be unique within a rule.",
          path: ["actions", index, "id"],
        })
      }
      ids.add(action.id)
    }
  })
export type AIAgentActionRule = z.infer<typeof aiAgentActionRuleSchema>

export const aiAgentActionRulesSchema = z
  .array(aiAgentActionRuleSchema)
  .max(20)
  .superRefine((rules, ctx) => {
    const ruleIds = new Set<string>()
    const actionIds = new Set<string>()
    for (const [index, rule] of rules.entries()) {
      if (ruleIds.has(rule.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rule IDs must be unique within an AI agent.",
          path: [index, "id"],
        })
      }
      ruleIds.add(rule.id)

      for (const [actionIndex, action] of rule.actions.entries()) {
        if (actionIds.has(action.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Action IDs must be unique within an AI agent.",
            path: [index, "actions", actionIndex, "id"],
          })
        }
        actionIds.add(action.id)
      }
    }
  })

export const DEFAULT_AI_AGENT_ACTION_PROMPT = `Match a rule only when all of these conditions are met:

- Its description is clearly satisfied by the current customer message and relevant conversation context.
- The match is based on explicit evidence, never assumptions or merely similar keywords.
- Required values are present in the customer's message or conversation.

You may match multiple rules when applicable.

Never:
- Invent missing values.
- Mention rule IDs, matching, structured output, or internal configuration to the customer.`

export const aiMcpServerAuth = z.discriminatedUnion("type", [
  z.object({
    type: z
      .literal(aiMcpServerAuthTypes.enum.none)
      .describe("No authentication; the server is called without credentials."),
  }),
  z.object({
    type: z
      .literal(aiMcpServerAuthTypes.enum.token)
      .describe("Authenticate with a single bearer token."),
    token: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Bearer token sent to the MCP server. Write-only: never returned by the API.",
      ),
  }),
  z.object({
    type: z
      .literal(aiMcpServerAuthTypes.enum.header)
      .describe("Authenticate with custom HTTP headers."),
    headers: z
      .array(
        z.object({
          header: z
            .string()
            .trim()
            .min(1)
            .describe("HTTP header name, e.g. `X-Api-Key`."),
          value: z
            .string()
            .trim()
            .min(1)
            .describe(
              "Header value sent to the MCP server. Write-only: never returned by the API.",
            ),
        }),
      )
      .describe("Custom headers added to every request to the MCP server."),
  }),
])
export type AIMcpServerAuth = z.infer<typeof aiMcpServerAuth>
