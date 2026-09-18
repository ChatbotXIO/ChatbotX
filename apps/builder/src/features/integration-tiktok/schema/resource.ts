import { z } from "zod"

export const integrationTiktokResource = z.object({
  id: z.string(),
  name: z.string(),
  openId: z.string(),
  tokenRefreshError: z.string().nullish(),
  /**
   * True while the connection is missing a scope comment automation needs.
   * Resolved on the server from `auth.metadata.scopes`, which must never reach
   * the client — the row also carries the client secret and both tokens.
   */
  needsReauthorization: z.boolean(),
})

export type IntegrationTiktokResource = z.infer<
  typeof integrationTiktokResource
>
