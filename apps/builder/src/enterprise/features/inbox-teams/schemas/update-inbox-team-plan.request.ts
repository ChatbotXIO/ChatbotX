import { z } from "zod"

export const updateInboxTeamPlanRequest = z.object({
  planId: z.cuid2(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional(),
  maxTeamMembers: z.number().int().positive().optional(),
  limits: z.record(z.unknown()).optional(),
  freeTrial: z
    .object({
      days: z.number().int().positive(),
    })
    .optional(),
})

export type UpdateInboxTeamPlanRequest = z.infer<
  typeof updateInboxTeamPlanRequest
>
