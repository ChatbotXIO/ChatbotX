import { z } from "zod"

export const deleteTeamMembersBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<Zod.ZodString>,
  teamId: z.ZodString
] = [
    z.string().cuid2(),
    z.array(z.string().cuid2()),
    z.string().cuid2(),
  ]

export type DeleteTeamMembersBindSchema = [chatbotId: string, ids: string[], teamId: string]
