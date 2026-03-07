import z from "zod"

export const createPlanRequest = z.object({
  name: z.string().trim().min(1).max(255),
  price: z.number().positive(),
  annualPrice: z.number().positive().optional(),
  limits: z.object({
    chatbots: z.number().int().positive().optional(),
  }),
})
export type CreatePlanRequest = z.infer<typeof createPlanRequest>

export const updatePlanRequest = createPlanRequest.partial()
export type UpdatePlanRequest = z.infer<typeof updatePlanRequest>
