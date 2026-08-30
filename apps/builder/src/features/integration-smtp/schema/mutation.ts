import { smtpProviders } from "@chatbotx.io/integration-smtp/schema"
import { z } from "zod"

const fromAddressRegex = /<([^>]+)>$/

// Accepts plain email or "Display Name <email>" / "Name" <email> formats.
export const fromAddressSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (val) => {
      const match = val.match(fromAddressRegex)
      const email = match ? match[1].trim() : val
      return z.email().safeParse(email).success
    },
    { message: "Invalid from address. Use an email or 'Name <email>' format." },
  )

export const createSmtpRequest = z
  .object({
    provider: smtpProviders,
    host: z.string(),
    port: z.coerce.number().int().positive().max(65_535),
    username: z.string().min(1).max(255),
    password: z.string().min(1).max(255),
    fromAddress: fromAddressSchema,
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
    provider: smtpProviders,
    host: z.string(),
    port: z.coerce.number().int().positive(),
    username: z.string().min(1),
    password: z.string().min(1),
    fromAddress: fromAddressSchema,
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
