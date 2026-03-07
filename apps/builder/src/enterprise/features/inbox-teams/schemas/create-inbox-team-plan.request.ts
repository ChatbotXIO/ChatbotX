import { z } from "zod"

export const createInboxTeamPlanRequest = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().optional(),
  maxTeamMembers: z.number().int().positive(),
  limits: z.record(z.unknown()).optional(),
  freeTrial: z
    .object({
      days: z.number().int().positive(),
    })
    .optional(),
  monthlyPrice: z.number().positive(),
  annualPrice: z.number().positive().optional(),
})

export type CreateInboxTeamPlanRequest = z.infer<
  typeof createInboxTeamPlanRequest
>
