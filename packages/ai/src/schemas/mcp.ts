import { z } from "zod"
import type { JsonObject } from "../utils"

export type JsonPrimitive = string | number | boolean | null

export const jsonRpcIdSchema = z
  .union([z.string(), z.number(), z.null()])
  .optional()

export const jsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
})

export const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional() as z.ZodType<
    JsonObject | undefined
  >,
})

export type MCPTool = z.infer<typeof mcpToolSchema>

export const mcpJsonRpcSuccessSchema = z.object({
  jsonrpc: z.string(),
  id: jsonRpcIdSchema,
  result: z.record(z.string(), z.unknown()) as z.ZodType<JsonObject>,
})

export const mcpJsonRpcErrorResponseSchema = z.object({
  jsonrpc: z.string(),
  id: jsonRpcIdSchema,
  error: jsonRpcErrorSchema,
})

export const mcpTextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
})

export const mcpContentArraySchema = z.array(
  z.union([mcpTextContentSchema, z.unknown()]),
)
