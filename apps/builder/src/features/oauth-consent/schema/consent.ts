import { z } from "zod"

export const oauthConsentRequest = z.discriminatedUnion("accept", [
  z.object({
    accept: z.literal(true),
    clientId: z.string().min(1),
    consentCode: z.string().min(1),
    workspaceId: z.string().min(1),
  }),
  z.object({
    accept: z.literal(false),
    clientId: z.string().min(1),
    consentCode: z.string().min(1),
  }),
])
