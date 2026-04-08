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

export const aiAgentProviders = z.enum(["openai", "gemini"])
export type AIAgentProvider = z.infer<typeof aiAgentProviders>

export const aiAgentProviderModel = z.object({
  provider: aiAgentProviders,
  model: z.string().trim().min(1),
})
export type AIAgentProviderModel = z.infer<typeof aiAgentProviderModel>

export const aiAgentProviderModels = z.array(aiAgentProviderModel).catch([])
export type AIAgentProviderModels = z.infer<typeof aiAgentProviderModels>

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
