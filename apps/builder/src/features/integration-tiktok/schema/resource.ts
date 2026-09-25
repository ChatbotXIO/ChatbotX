import { z } from "zod"

export const integrationTiktokResource = z.object({
  id: z.string(),
  inboxId: z.string(),
  name: z.string(),
  openId: z.string(),
  tokenRefreshError: z.string().nullish(),
  /**
   * True while the connection is missing a scope comment automation needs.
   * Resolved on the server from `auth.metadata.scopes`, which must never reach
   * the client — the row also carries the client secret and both tokens.
   */
  needsReauthorization: z.boolean(),
  /**
   * Cached Comment-to-Message setting, the switch that decides whether TikTok
   * delivers high-intent comment events for this account at all.
   *
   * `null` means "never read back from TikTok", which every connection made
   * before the feature shipped reports. The toggle renders that as off with a
   * hint, not as a confident "disabled" — the owner may well have enabled it
   * inside the TikTok app, where nothing tells us.
   */
  commentToMessageStatus: z.enum(["ENABLE", "DISABLE"]).nullish(),
})

export type IntegrationTiktokResource = z.infer<
  typeof integrationTiktokResource
>
