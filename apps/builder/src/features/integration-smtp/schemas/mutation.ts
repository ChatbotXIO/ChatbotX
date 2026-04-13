import { smtpProviders } from "@chatbotx.io/integration-smtp"
import { z } from "zod"

export const createSmtpRequest = z
  .object({
    provider: smtpProviders,
    host: z.string().optional(),
    port: z.coerce.number().int().positive().max(65_535).optional(),
    username: z.string().min(1).max(255),
    password: z.string().min(1).max(255),
    fromAddress: z.email(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "other") {
      if (!data.host || data.host.trim().length === 0) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Host is required when provider is 'other'",
          path: ["host"],
          expected: "url",
        })
      }
      if (!data.port) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Port is required when provider is 'other'",
          path: ["port"],
          expected: "number",
        })
      }
    }
  })
export type CreateSmtpRequest = z.infer<typeof createSmtpRequest>

export const updateSmtpRequest = z
  .object({
    name: z.string().min(1).max(40).optional(),
    provider: smtpProviders.optional(),
    host: z.string().optional(),
    port: z.coerce.number().int().positive().optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    fromAddress: z.string().email().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "other") {
      if (!data.host || data.host.trim().length === 0) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Host is required when provider is 'other'",
          path: ["host"],
          expected: "url",
        })
      }
      if (!data.port) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Port is required when provider is 'other'",
          path: ["port"],
          expected: "number",
        })
      }
    }
  })
export type UpdateSmtpRequest = z.infer<typeof updateSmtpRequest>
