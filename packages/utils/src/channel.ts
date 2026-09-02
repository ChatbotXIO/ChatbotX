import { z } from "zod"

/**
 * The channels a workspace can talk to a contact through.
 *
 * See this package's README ("Exception: cross-cutting product enums") for why
 * a product enum lives in a generic-utils package: `@chatbotx.io/flow-config`
 * needs it without depending on `@chatbotx.io/database`. Before this move those
 * tables had to fall back to `Record<string, ...>`, so a typo'd or renamed
 * channel silently missed its entry instead of failing to compile.
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
  "api",
])

export type ChannelType = z.infer<typeof channelTypes>

/**
 * Channels Meta ads attribution (CTWA/CTM/CTID) exists for — the subset of
 * `channelTypes` with an ads conversion pipeline (referral capture →
 * conversion rules → CAPI). Lives here for the same reason as `channelTypes`
 * (see the comment above): `@chatbotx.io/database` (contact-filter queries),
 * `@chatbotx.io/business` (ads-conversion channel maps), and the builder
 * (analytics/filter schemas) all need the identical list, and the database
 * layer cannot import from business. Each layer derives its own stricter
 * type from this (e.g. business `AdsEligibleChannel` re-checks it against
 * the DB `AdsConversionChannel` enum via `satisfies`).
 *
 * Adding a channel here cascades: every `satisfies Record<AdsEligibleChannel,
 * ...>` map in `@chatbotx.io/business/ads-conversion/channel-fields` (and its
 * consumers) fails to compile until the new channel is threaded through.
 */
export const adsEligibleChannelTypes = z.enum([
  "whatsapp",
  "messenger",
  "instagram",
])

export type AdsEligibleChannelType = z.infer<typeof adsEligibleChannelTypes>

/**
 * The ads-eligible channels whose attribution keys on Meta's ad-referral
 * webhook fields (`referral.ad_id` + `referral.source === "ADS"`) instead of
 * a click id (`ctwa_clid`, WhatsApp-only).
 */
export const adReferralChannelTypes = z.enum(["messenger", "instagram"])

export type AdReferralChannelType = z.infer<typeof adReferralChannelTypes>

/**
 * The legacy/DB-default ads-conversion channel: every `AdsConversionEvent`
 * row created before Phase 2 generalization (messenger/instagram support)
 * was implicitly WhatsApp, and the DB column still defaults to it. Callers
 * that accept an optional `channel` and need "omitted = whatsapp" behavior
 * (query filters, insert conflict-target selection, analytics schema
 * defaults) fall back to this constant instead of a repeated `"whatsapp"`
 * literal.
 */
export const DEFAULT_ADS_CONVERSION_CHANNEL: AdsEligibleChannelType = "whatsapp"

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
 * `order` is a deliberate product-priority order — whatsapp, messenger,
 * instagram, tiktok, telegram, zalo, webchat, then smtp (Email), then api —
 * rather than alphabetical or either legacy list's order: the create picker
 * (`whatsapp, messenger, instagram, zalo, tiktok, telegram, webchat`) and the
 * settings accordion (`whatsapp, messenger, instagram, zalo, telegram,
 * tiktok, webchat, smtp`) already disagreed with each other before this
 * registry existed. `omnichannel` (the non-connectable fallback) always
 * sorts last.
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
  whatsapp: {
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
  instagram: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 3,
  },
  tiktok: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 4,
  },
  telegram: {
    creatable: true,
    manageable: true,
    requiresCredential: false,
    order: 5,
  },
  zalo: {
    creatable: true,
    manageable: true,
    requiresCredential: true,
    order: 6,
  },
  webchat: {
    creatable: true,
    manageable: true,
    requiresCredential: false,
    order: 7,
  },
  smtp: {
    creatable: false,
    manageable: true,
    requiresCredential: false,
    order: 8,
  },
  api: {
    creatable: true,
    manageable: true,
    requiresCredential: false,
    order: 9,
  },
  // Not a real connectable channel — the fallback icon/label for unknown
  // channel strings (see `InboxIcon`'s `isChannelType` guard). Never offered
  // for creation and never given its own settings row.
  omnichannel: {
    creatable: false,
    manageable: false,
    requiresCredential: false,
    order: 10,
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
