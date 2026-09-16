import { z } from "zod"

export const getIntegrationRequest = z.object({
  id: z.string().describe("Integration id. Get it from `integrations.list`."),
})

export const tokenRefreshErrorChannel = z.enum([
  "zalo",
  "tiktok",
  "instagram",
  "instagramFacebook",
  "messenger",
  "whatsapp",
  "threads",
])

export const tokenRefreshErrorResource = z.object({
  id: z.string(),
  channel: tokenRefreshErrorChannel,
  name: z.string(),
  error: z.string(),
})

export const listTokenRefreshErrorsResponse = z.object({
  data: z.array(tokenRefreshErrorResource),
})
