import { z } from "zod"
import { javascriptSandboxErrorCodes } from "./errors"

export const MAX_CODE_LENGTH = 10_000
export const MAX_EXECUTION_RESULT_BYTES = 8 * 1024 * 1024

export const executeRequestSchema = z.object({
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  input: z.record(z.string(), z.unknown()),
})

export const executeSuccessResponseSchema = z.object({
  value: z.unknown(),
})

export const executeErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(javascriptSandboxErrorCodes),
    message: z.string(),
  }),
})

export type ExecuteJavascriptRequest = z.infer<typeof executeRequestSchema>
export type ExecuteJavascriptSuccessResponse = z.infer<
  typeof executeSuccessResponseSchema
>
