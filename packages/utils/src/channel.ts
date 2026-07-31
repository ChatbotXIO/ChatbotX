import { z } from "zod"

/**
 * The channels a workspace can talk to a contact through.
 *
 * Lives here rather than in `@chatbotx.io/database` because packages that need
 * to key data by channel — `@chatbotx.io/flow-config` most of all, which holds
 * the per-channel step rules — must not depend on the database layer. Before
 * this move those tables had to fall back to `Record<string, ...>`, so a typo'd
 * or renamed channel silently missed its entry instead of failing to compile.
 *
 * `@chatbotx.io/database/partials` re-exports this, so the many existing
 * importers there keep working unchanged.
 *
 * Adding a value here cascades: grep for `Record<ChannelType` and fix every
 * exhaustive map before assuming the build is green.
 */
export const channelTypes = z.enum([
  "omnichannel",
  "webchat",
  "messenger",
  "whatsapp",
  "zalo",
  "smtp",
  "telegram",
  "instagram",
  "tiktok",
])

export type ChannelType = z.infer<typeof channelTypes>
