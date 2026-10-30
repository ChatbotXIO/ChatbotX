import { z } from "zod"

export const oauthConsentRequest = z.discriminatedUnion("accept", [
  z.object({
    accept: z.literal(true),
    oauthQuery: z.string().min(1),
    workspaceId: z.string().min(1),
  }),
  z.object({
    accept: z.literal(false),
    oauthQuery: z.string().min(1),
  }),
])
