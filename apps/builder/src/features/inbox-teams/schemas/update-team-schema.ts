import { z } from "zod";

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type UpdateTeamSchema = z.infer<typeof updateTeamSchema>

export const updateTeamBindSchema: [
  chatbotId: z.ZodString,
  teamId: z.ZodString,
] = [
    z.string().cuid2(),
    z.string().cuid2(),
  ]

export type UpdateTeamBindSchema = [chatbotId: string, teamId: string]
