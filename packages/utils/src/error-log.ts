import { z } from "zod"
import { channelTypes } from "./channel"

/**
 * Every `channelTypes` value except `omnichannel`, which is only the fallback
 * label for an unknown channel string, not a real destination — an
 * unrecognised channel writes no row at all.
 *
 * Derived rather than re-typed: a new channel becomes a valid provider by
 * construction, so the two enums cannot drift.
 */
const channelProviders = channelTypes.options.filter(
  (channel) => channel !== "omnichannel",
)

/**
 * Closed set of third parties `ErrorLog` can attribute a failure to. The stored
 * `ErrorLog.action` is one of these values verbatim — no operation name, no
 * prefix, no free text (see the design spec's "Accepted trade-off").
 *
 * Lives here rather than in `packages/database` so `worker-config` and
 * `business` can both reach it without a dependency cycle, exactly as
 * `channelTypes` does (see `./channel`).
 *
 * Deliberately absent:
 * - `system` — internal job failures are not third-party failures and do not
 *   belong in this table.
 * - `facebook-lead-ads` — not an integration; Lead Ads rides `facebook-ads`.
 * - `chatbotx` — `integrations/chatbotx` is an inert stub.
 * - `instagram-facebook` — the Facebook-linked Instagram variant is an
 *   auth/endpoint distinction, not a separate destination. Message sends
 *   through it already log as `instagram` (the `ChannelType`), so a second
 *   label would only split one integration's failures across two filter
 *   values. Its token-refresh cron logs `instagram` too.
 */
export const errorLogProviders = z.enum([
  ...channelProviders,
  // meta platform surfaces
  "meta-catalog",
  "meta-conversions",
  "facebook-ads",
  // marketing / CRM
  "mailchimp",
  "sendgrid",
  "active-campaign",
  "klaviyo",
  "get-response",
  "drip",
  "mailer-lite",
  "moosend",
  // productivity / AI
  "google-sheets",
  "google-calendar",
  "openai",
])

export type ErrorLogProvider = z.infer<typeof errorLogProviders>

/**
 * Display name for every provider. UI surfaces that show `ErrorLog.action` to
 * a user (the error-log table's Type column) render this, never the raw slug.
 *
 * Third-party product names are not translated — the same convention
 * `allInboxConfigs` already uses for the builder's channel labels. Only the
 * column *header* is a translated string.
 *
 * Being a `Record<ErrorLogProvider, string>`, a new provider — including a new
 * `channelTypes` value, which becomes a provider by construction — fails to
 * compile until it gets a label here.
 *
 * The stored values stay slugs: `errorLogProviders.safeParse(inbox.channel)`
 * at every write site derives the provider straight from `ChannelType`, so
 * humanising the enum itself would need a reverse map at each of those sites
 * and would leave already-written rows unreadable.
 */
export const errorLogProviderLabels = {
  // channels — `smtp` is "Email" everywhere in the product, and a slug
  // humanised to "Smtp" is not a name a user recognises.
  webchat: "Webchat",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  zalo: "Zalo",
  smtp: "Email",
  telegram: "Telegram",
  instagram: "Instagram",
  tiktok: "TikTok",
  api: "API",
  // meta platform surfaces
  "meta-catalog": "Meta catalog",
  "meta-conversions": "Meta conversions",
  "facebook-ads": "Facebook ads",
  // marketing / CRM — vendor casing wins over sentence case where the brand
  // itself is written that way (ActiveCampaign, GetResponse, MailerLite).
  mailchimp: "Mailchimp",
  sendgrid: "SendGrid",
  "active-campaign": "ActiveCampaign",
  klaviyo: "Klaviyo",
  "get-response": "GetResponse",
  drip: "Drip",
  "mailer-lite": "MailerLite",
  moosend: "Moosend",
  // productivity / AI
  "google-sheets": "Google sheets",
  "google-calendar": "Google calendar",
  openai: "OpenAI",
} as const satisfies Record<ErrorLogProvider, string>

/**
 * `ErrorLog.action` is a plain `text` column, so a row written by an older
 * build (or by a provider since removed from the enum) can hold a value with
 * no label. Falls back to the raw stored value rather than rendering nothing.
 */
export function errorLogProviderLabel(action: string): string {
  return action in errorLogProviderLabels
    ? errorLogProviderLabels[action as ErrorLogProvider]
    : action
}
