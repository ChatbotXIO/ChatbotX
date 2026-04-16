import { z } from "zod"

export type JsonPrimitive = string | number | boolean | null
export const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[]

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(z.lazy(() => jsonValueSchema)),
    z.record(
      z.string(),
      z.lazy(() => jsonValueSchema),
    ),
  ]),
)

export const jsonObjectSchema: z.ZodType<JsonObject> = z.lazy(() =>
  z.record(z.string(), jsonValueSchema),
)
export type JsonObject = { [key: string]: JsonValue }

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
  inputSchema: jsonObjectSchema.optional(),
})

export type MCPTool = z.infer<typeof mcpToolSchema>

export const mcpJsonRpcSuccessSchema = z.object({
  jsonrpc: z.string(),
  id: jsonRpcIdSchema,
  result: jsonObjectSchema,
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
