import { z } from "zod"

export const integrationPropsSchema = z.object({
  name: z.string().trim().min(1),
})

export const parsedErrorSchema = z.object({
  code: z.union([z.string(), z.number()]),
  message: z.string(),
  statusCode: z.number(),
  subcode: z.union([z.string(), z.number()]),
})

export type ParsedError = z.infer<typeof parsedErrorSchema>
