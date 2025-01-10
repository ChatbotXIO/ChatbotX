import { z } from "zod"

export const createTeamSchema = z.object({
  name: z.string().min(1),
  userIds: z.array(z.string().cuid2()),
})

export type CreateTeamSchema = z.infer<typeof createTeamSchema>

export const createTeamBindSchema: [
  chatbotId: z.ZodString,
] = [
    z.string().cuid2(),
  ]

export type CreateTeamBindSchema = [chatbotId: string]
