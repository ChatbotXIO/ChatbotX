import { z } from "zod"

export const createTeamMemberSchema = z.object({
  userIds: z.array(z.string().cuid2()),
})

export type CreateTeamMemberSchema = z.infer<typeof createTeamMemberSchema>

export const createTeamMemberBindSchema: [
  chatbotId: z.ZodString,
  teamId: z.ZodString,
] = [
    z.string().cuid2(),
    z.string().cuid2(),
  ]

export type CreateTeamMemberBindSchema = [chatbotId: string, teamId: string]
