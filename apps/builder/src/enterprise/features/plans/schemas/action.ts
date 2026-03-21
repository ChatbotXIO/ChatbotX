// biome-ignore lint/performance/noNamespaceImport: safe import
import * as currentCodes from "currency-codes"
import z from "zod"

export const createPlanRequest = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional(),
  currency: z.enum(currentCodes.codes()),
  price: z.coerce.number().min(0),
  annualPrice: z.coerce.number().min(0).optional(),
  limits: z.object({
    contacts: z.coerce.number().int().positive(),
  }),
  freeTrial: z
    .object({
      days: z.coerce.number().int().min(0),
    })
    .optional(),
  marketingFeatures: z.array(
    z.object({
      value: z.string().trim().min(1).max(500),
    }),
  ),
})
export type CreatePlanRequest = z.infer<typeof createPlanRequest>

export const updatePlanRequest = z
  .object({
    id: z.string().min(1),
  })
  .and(createPlanRequest.partial())
export type UpdatePlanRequest = z.infer<typeof updatePlanRequest>
