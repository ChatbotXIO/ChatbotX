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

/**
 * Static, presentation-agnostic facts about a channel that the create picker
 * and settings screens both need. This is the single source of truth for
 * "which channels can a user create/manage and in what order" — it replaces
 * what used to be separately hardcoded `ChannelType[]` literals in
 * `inbox-select-card.tsx` and `settings/channels/layout.tsx`.
 *
 * Being a `Record<ChannelType, ...>`, adding a value to `channelTypes` forces
 * a compile error here until an entry is added — the same exhaustiveness
 * guarantee `INBOX_ICON_CONFIG` already relies on, so a new channel can never
 * silently go missing from the picker or the settings accordion the way the
 * old plain-array lists allowed.
 *
 * `order` is alphabetical by channel name rather than copying either legacy
 * list's order: the create picker (`whatsapp, messenger, instagram, zalo,
 * tiktok, telegram, webchat`) and the settings accordion (`whatsapp,
 * messenger, instagram, zalo, telegram, tiktok, webchat, smtp`) already
 * disagreed with each other before this registry existed, so there was no
 * single order that preserved both — alphabetical is a neutral, unambiguous
 * default going forward.
 */
export type ChannelCapability = {
  /** Shown as an option on the "create new channel" picker. */
  creatable: boolean
  /** Gets a row in the workspace settings channels accordion. */
  manageable: boolean
  /**
   * Whether creating this channel requires a resolved platform credential
   * first (OAuth-style channels). `false` for self-serve channels
   * (telegram, webchat) that never gate on `platformCredentialService`.
   */
  requiresCredential: boolean
  /** Relative display order in the picker and the settings accordion. */
  order: number
}

export const CHANNEL_CAPABILITIES: Record<ChannelType, ChannelCapability> = {
  instagram: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 1,
  },
  messenger: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 2,
  },
  smtp: {
    creatable: false,
    manageable: true,
    requiresCredential: false,
    order: 3,
  },
  telegram: {
    creatable: true,
    manageable: true,
    requiresCredential: false,
    order: 4,
  },
  tiktok: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 5,
  },
  webchat: {
    creatable: true,
    manageable: true,
    requiresCredential: false,
    order: 6,
  },
  whatsapp: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 7,
  },
  zalo: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 8,
  },
  // Not a real connectable channel — the fallback icon/label for unknown
  // channel strings (see `InboxIcon`'s `isChannelType` guard). Never offered
  // for creation and never given its own settings row.
  omnichannel: {
    creatable: false,
    manageable: false,
    requiresCredential: false,
    order: 9,
  },
}

/**
 * Channels offered on the "create new channel" picker, in display order.
 * Derived from `CHANNEL_CAPABILITIES` rather than hardcoded so a new channel
 * type shows up here automatically once its capability entry is filled in.
 */
export const CREATABLE_CHANNELS: ChannelType[] = channelTypes.options
  .filter((channel) => CHANNEL_CAPABILITIES[channel].creatable)
  .sort((a, b) => CHANNEL_CAPABILITIES[a].order - CHANNEL_CAPABILITIES[b].order)

/**
 * Channels with a row in the workspace settings channels accordion, in
 * display order. Still requires a matching `settings/channels/<channel>/page.tsx`
 * route — a filesystem constraint this registry cannot remove — but a missing
 * route now 404s loudly rather than the silent omission a hand-maintained
 * array allowed.
 */
export const MANAGEABLE_CHANNELS: ChannelType[] = channelTypes.options
  .filter((channel) => CHANNEL_CAPABILITIES[channel].manageable)
  .sort((a, b) => CHANNEL_CAPABILITIES[a].order - CHANNEL_CAPABILITIES[b].order)
