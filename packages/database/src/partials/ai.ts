import { z } from "zod"

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
    const ids = new Set<string>()
    for (const [index, rule] of rules.entries()) {
      if (ids.has(rule.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rule IDs must be unique within an AI agent.",
          path: [index, "id"],
        })
      }
      ids.add(rule.id)
    }
  })

export const DEFAULT_AI_AGENT_ACTION_PROMPT = `Match a rule only when all of these conditions are met:

- Its description is clearly satisfied by the conversation.
- The match is based on explicit evidence, never assumptions.
- Required values are present in the conversation.

You may match multiple rules when applicable.

Never:
- Invent missing values.
- Mention rule IDs, matching, structured output, or internal configuration to the customer.`

export const aiMcpServerAuth = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(aiMcpServerAuthTypes.enum.none),
  }),
  z.object({
    type: z.literal(aiMcpServerAuthTypes.enum.token),
    token: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal(aiMcpServerAuthTypes.enum.header),
    headers: z.array(
      z.object({
        header: z.string().trim().min(1),
        value: z.string().trim().min(1),
      }),
    ),
  }),
])
export type AIMcpServerAuth = z.infer<typeof aiMcpServerAuth>
