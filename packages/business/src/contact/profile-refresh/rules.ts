import { type ChannelType, genderTypes } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import type { IncomingContact } from "@chatbotx.io/sdk"

/**
 * Where a contact's profile name can come from, per channel. Exhaustive over
 * `ChannelType` (invariant #3: adding a channel is a compile error here until
 * a row is added — the row is the whole decision, callers never branch on
 * the channel name).
 *
 * - `inbound`: how the worker refreshes a nameless existing contact on a real
 *   inbound message. `"channelApi"` reuses the channel's `contact.getProfile`
 *   handler; `"payload"` applies the `IncomingContact` the channel already
 *   parsed from the webhook (no network); `null` = nothing to do.
 * - `onDemand`: the channel has a `contact.getProfile` handler that returns a
 *   name, so the builder can refresh on request and the worker fetches at
 *   creation time (replaces `canGetUserProfileIfNeeded`).
 */
export const CONTACT_PROFILE_NAME_SOURCES = ["payload", "channelApi"] as const
export type ContactProfileNameSource =
  (typeof CONTACT_PROFILE_NAME_SOURCES)[number]

export type ContactProfileNameCapability = {
  inbound: ContactProfileNameSource | null
  onDemand: boolean
}

export const contactProfileNameCapabilities = {
  messenger: { inbound: "channelApi", onDemand: true },
  instagram: { inbound: "channelApi", onDemand: true }, // direct and via-Facebook; registry dispatch is the app's concern
  zalo: { inbound: "channelApi", onDemand: true },
  telegram: { inbound: "channelApi", onDemand: true }, // getChat keyed by the contact's chat id — identity-safe (payload names a clicking user, not the chat)
  whatsapp: { inbound: "payload", onDemand: false }, // contacts[0].profile.name; no user-profile API
  tiktok: { inbound: null, onDemand: false }, // webhook carries ids only, no profile API
  api: { inbound: "payload", onDemand: false },
  webchat: { inbound: null, onDemand: false },
  smtp: { inbound: null, onDemand: false },
  omnichannel: { inbound: null, onDemand: false },
} as const satisfies Record<ChannelType, ContactProfileNameCapability>

export type OnDemandProfileChannel = {
  [K in ChannelType]: (typeof contactProfileNameCapabilities)[K]["onDemand"] extends true
    ? K
    : never
}[ChannelType] // "messenger" | "instagram" | "zalo" | "telegram"

/**
 * Null-safe against a runtime `channel` value outside `ChannelType` — `Inbox`
 * / `ContactInbox`.`channel` is a plain `text()` column (callers cast `as
 * ChannelType`), so a legacy/unknown row must resolve to "no source" instead
 * of throwing a `TypeError` on the missing table row (matches the pre-table
 * `canGetUserProfileIfNeeded`, which returned `false` for anything unknown).
 */
export const resolveInboundProfileNameSource = (
  channel: ChannelType,
): ContactProfileNameSource | null =>
  contactProfileNameCapabilities[channel]?.inbound ?? null

export const hasOnDemandProfileApi = (
  channel: ChannelType,
): channel is OnDemandProfileChannel =>
  contactProfileNameCapabilities[channel]?.onDemand ?? false

/** Only channel-API attempts are rate-limited; payload attempts are free. */
export const COOLDOWN_BY_PROFILE_SOURCE = {
  payload: false,
  channelApi: true,
} as const satisfies Record<ContactProfileNameSource, boolean>

/**
 * The exact set of ECMAScript `WhiteSpace` + `LineTerminator` code points
 * `String.prototype.trim()` strips (ECMA-262 `TrimString`) — the same set
 * `hasEmptyProfileName`/`hasProfileName` below rely on via `.trim()`. Kept
 * as one exported source of truth so `ContactService.updateIfProfileNameEmpty`
 * (`packages/business/src/contact/service.ts`) can bind the identical
 * character set into Postgres' `btrim(text, characters)` instead of
 * drifting from JS's definition of "blank" — plain `btrim(text)` (no
 * second argument) only strips ASCII space, which would let a
 * tab-only/NBSP-only name (blank per `.trim()`) desync the SQL predicate
 * from `hasEmptyProfileName` and silently stop backfilling forever.
 *
 * Written as explicit `\u` escapes (never literal characters) so the exact
 * code points are auditable in source and immune to editor/encoding
 * mangling: TAB, LF, VT, FF, CR, SPACE, NBSP, OGHAM SPACE MARK, EN QUAD..
 * HAIR SPACE (U+2000-U+200A), LINE SEPARATOR, PARAGRAPH SEPARATOR, NARROW
 * NO-BREAK SPACE, MEDIUM MATHEMATICAL SPACE, IDEOGRAPHIC SPACE, ZERO WIDTH
 * NO-BREAK SPACE (BOM).
 */
export const PROFILE_NAME_BLANK_CHARACTERS =
  "\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF"

export type ContactProfileName = Pick<ContactModel, "firstName" | "lastName">
/** Empty only when BOTH names are blank — either one present means "has a name". */
export const hasEmptyProfileName = (contact: ContactProfileName): boolean =>
  !(contact.firstName?.trim() || contact.lastName?.trim())

/** Contact columns a channel profile may write. `fullName` is generated — never written. */
export type ContactProfileUpdate = Partial<
  Pick<
    ContactModel,
    "firstName" | "lastName" | "avatar" | "locale" | "timezone" | "gender"
  >
>

/**
 * Per-column mapper table. `gender` is validated with the DB enum, not cast.
 * `undefined` values are dropped so a channel lacking `pages_user_locale` /
 * `timezone` / `gender` never clobbers existing data. Replaces `buildCandidate`
 * in `apps/worker/src/integration/handlers/messenger-contact-data.ts:26-49`.
 */
const profileColumnMappers = {
  firstName: (p) => p.firstName,
  lastName: (p) => p.lastName,
  avatar: (p) => p.avatar,
  locale: (p) => p.locale,
  timezone: (p) => p.timezone,
  gender: (p) => genderTypes.safeParse(p.gender).data,
} as const satisfies {
  [K in keyof ContactProfileUpdate]-?: (
    profile: IncomingContact,
  ) => ContactProfileUpdate[K] | undefined
}

type ProfileColumn = keyof typeof profileColumnMappers
const PROFILE_COLUMNS = Object.keys(
  profileColumnMappers,
) as readonly ProfileColumn[] // literal-union narrowing, not `any`

/**
 * Typed accumulation over `PROFILE_COLUMNS` — no `Object.fromEntries` index
 * signature, and no per-iteration object-spread (avoids the O(n²) pattern on
 * an accumulator): the local `update` object is built once and returned.
 */
export const buildContactProfileUpdate = (
  profile: IncomingContact,
): ContactProfileUpdate => {
  const update: ContactProfileUpdate = {}
  for (const column of PROFILE_COLUMNS) {
    const value = profileColumnMappers[column](profile)
    if (value !== undefined) {
      update[column] = value
    }
  }
  return update
}

/** A refresh only counts when the channel returned a usable name. */
export const hasProfileName = (update: ContactProfileUpdate): boolean =>
  Boolean(update.firstName?.trim() || update.lastName?.trim())
