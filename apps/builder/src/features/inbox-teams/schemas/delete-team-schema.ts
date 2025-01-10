import { z } from "zod"

export const deleteTeamBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodString,
] = [
    z.string().cuid2(),
    z.string().cuid2(),
  ]

export type DeleteTeamBindSchema = [chatbotId: string, ids: string]
