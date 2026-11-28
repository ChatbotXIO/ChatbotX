import type { ChannelType } from "@chatbotx.io/database/partials"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  AtSignIcon,
  FingerprintIcon,
  type LucideIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react"
import type { ContactInboxResource } from "../../contact-inboxes/schema/resource"
import type { ContactEditableField } from "../schema/resource"

type Translate = (key: string) => string
type FormatNumber = (value: number) => string

/** Everything a row formatter may need; built by the caller from next-intl. */
export type ScopedIdentityFormatContext = {
  t: Translate
  formatNumber: FormatNumber
}

/** Placeholder shown when a supported value was never captured (null). */
export const UNKNOWN_VALUE_PLACEHOLDER = "—"

type ScopedIdentityKey =
  | "sourceUserId"
  | "sourceUsername"
  | "followsBusiness"
  | "followerCount"

export type ScopedIdentityValue = ContactInboxResource[ScopedIdentityKey]

type ScopedIdentityRowConfig = {
  key: ScopedIdentityKey
  icon: LucideIcon
  labelKey: string
  /**
   * Turns the raw column value into display text. Return null for "unknown".
   * Omitted: the value is shown as-is when it is a non-empty string.
   */
  format?: (
    value: ScopedIdentityValue,
    context: ScopedIdentityFormatContext,
  ) => string | null
  /**
   * What to do with a null/unknown value. "hide" omits the row, "placeholder"
   * shows UNKNOWN_VALUE_PLACEHOLDER. Defaults to "hide".
   */
  whenUnknown?: "hide" | "placeholder"
}

/** Boolean -> Yes/No. null/undefined stays unknown; false is a real answer. */
export const formatYesNo = (
  value: ScopedIdentityValue,
  { t }: ScopedIdentityFormatContext,
): string | null => {
  if (typeof value !== "boolean") {
    return null
  }
  return t(value ? "fields.channelProfile.yes" : "fields.channelProfile.no")
}

/** Count -> localized number. null/undefined stays unknown; 0 is a real count. */
export const formatCount = (
  value: ScopedIdentityValue,
  { formatNumber }: ScopedIdentityFormatContext,
): string | null =>
  typeof value === "number" && Number.isFinite(value)
    ? formatNumber(value)
    : null

// Both Instagram logins (Instagram Login and Facebook Login) store their
// contact inboxes under the single `instagram` ChannelType and fill these
// columns from the same IG User Profile API fields.
const instagramProfileRows: readonly ScopedIdentityRowConfig[] = [
  {
    key: "followsBusiness",
    icon: UserCheckIcon,
    labelKey: "fields.channelProfile.followsBusiness",
    format: formatYesNo,
    whenUnknown: "placeholder",
  },
  {
    key: "followerCount",
    icon: UsersIcon,
    labelKey: "fields.channelProfile.followerCount",
    format: formatCount,
    whenUnknown: "placeholder",
  },
]

/**
 * Per-channel display config for the channel-scoped columns on ContactInbox.
 * Labels are channel-branded, so each channel that populates these columns
 * declares its own rows here — adding a channel is one config entry, no
 * branching.
 */
export const scopedIdentityRowsByChannel: Partial<
  Record<ChannelType, readonly ScopedIdentityRowConfig[]>
> = {
  [channelTypes.enum.whatsapp]: [
    {
      key: "sourceUserId",
      icon: FingerprintIcon,
      labelKey: "fields.channelIdentity.bsuid",
    },
    {
      key: "sourceUsername",
      icon: AtSignIcon,
      labelKey: "fields.waUserName.label",
    },
  ],
  [channelTypes.enum.instagram]: instagramProfileRows,
}

const defaultFormat = (value: ScopedIdentityValue): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

export const buildScopedIdentityFields = (
  contactInbox: ContactInboxResource | undefined,
  context: ScopedIdentityFormatContext,
): ContactEditableField[] => {
  const { t } = context
  const parsedChannel = channelTypes.safeParse(contactInbox?.channel)
  if (!(contactInbox && parsedChannel.success)) {
    return []
  }
  const rows = scopedIdentityRowsByChannel[parsedChannel.data] ?? []
  return rows.flatMap((row): ContactEditableField[] => {
    const formatted = (row.format ?? defaultFormat)(
      contactInbox[row.key],
      context,
    )
    const value =
      formatted ??
      (row.whenUnknown === "placeholder" ? UNKNOWN_VALUE_PLACEHOLDER : null)
    if (!value) {
      return []
    }
    return [
      {
        key: row.key,
        icon: row.icon,
        label: t(row.labelKey),
        value,
        type: "shortText",
        readOnly: true,
      },
    ]
  })
}
