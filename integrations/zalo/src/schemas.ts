import type { Oauth2AuthValue, Oauth2Config } from "@aha.chat/sdk"
import z from "zod"

export type ZaloConfig = Oauth2Config & {
  version: string
  stateParams: {
    chatbotId: string
  }
}

export type ZaloAuthValue = Oauth2AuthValue & {
  oaId: string
  metadata: {
    OAName: string
  }
}

// biome-ignore lint/complexity/noBannedTypes: wip
export type ZaloActions = {}

export const zaloTokens = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.string(),
})
export type ZaloTokens = z.infer<typeof zaloTokens>

export const OAProfile = z.object({
  oa_id: z.string(),
  name: z.string(),
  description: z.string(),
  avatar: z.string().url(),
})
export type zaloOAProfile = z.infer<typeof OAProfile>
