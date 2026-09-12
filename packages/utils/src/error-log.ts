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
  // productivity
  "google-sheets",
  "google-calendar",
  // AI vendors. Hand-listed rather than derived: the source of truth
  // (`aiProviders` in `packages/ai`, `aiAgentProviders` in
  // `packages/database`) sits *above* this package, so importing either would
  // invert the dependency. `openai-compatible` is the custom-endpoint variant
  // — a self-hosted or third-party OpenAI-shaped API is not OpenAI, and
  // folding it in would attribute its failures to a vendor the workspace does
  // not even use.
  "openai",
  "gemini",
  "claude",
  "deepseek",
  "openrouter",
  "openai-compatible",
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
  // productivity
  "google-sheets": "Google sheets",
  "google-calendar": "Google calendar",
  // AI vendors — the same names the builder's provider picker shows
  // (`aiProviders.*` in `apps/builder/messages/en.json`).
  openai: "OpenAI",
  gemini: "Gemini",
  claude: "Claude",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  "openai-compatible": "OpenAI Compatible",
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

/**
 * Every provider whose display label contains `keyword`, case-insensitively.
 *
 * `ErrorLog.action` stores the slug, so an `ilike` over the column matches what
 * is stored (`smtp`) and never what the table renders ("Email"). Search
 * surfaces feed this back in as an `action IN (…)` term so the value a user can
 * actually see is the value they can search for.
 */
export function errorLogProvidersMatchingLabel(
  keyword: string,
): ErrorLogProvider[] {
  const needle = keyword.trim().toLowerCase()
  if (needle.length === 0) {
    return []
  }
  return Object.entries(errorLogProviderLabels)
    .filter(([, label]) => label.toLowerCase().includes(needle))
    .map(([provider]) => provider as ErrorLogProvider)
}

/**
 * Frames only — 2048 characters is roughly 20 of them, and Node's default
 * `Error.stackTraceLimit` is 10, so a typical stack is stored whole. The cap
 * guards the `events:error-log` stream's byte budget (see
 * `packages/event-bus/src/error-log/event-bus.ts`) against a raised limit or
 * pathologically long paths.
 */
export const MAX_STACK_LENGTH = 2048

/** A frame line: indentation, then `at `. Line-anchored, so `\n` is not part of it. */
const STACK_FRAME_LINE = /^[ \t]+at /m

/**
 * The frame lines of `error.stack`, without the `"<Name>: <message>"` prefix,
 * capped at {@link MAX_STACK_LENGTH}. Destined for `ErrorLog.stackTrace`.
 *
 * The prefix is dropped rather than truncated along with the rest: a provider
 * that embeds a response body into `message` would otherwise fill the whole
 * budget and leave no frames at all — the same pathology the `detail` cap
 * exists for. The message is already stored in `detail`.
 *
 * `undefined` when the value is not an `Error`, or when its stack carries no
 * frames, so a NULL column always means "no stack was available here".
 *
 * Lives here rather than in `business/error-log` so the worker's `chat`
 * handlers can capture frames inside their own `catch` — before `parseSdkError`
 * turns the throw into a stackless `ParsedError` for the `message:failed`
 * payload — without pulling the error-log service (and its event-bus and Redis
 * dependencies) into a send path. Same reasoning as `errorLogProviders` above.
 */
export function resolveStackFrames(error: unknown): string | undefined {
  if (!(error instanceof Error) || typeof error.stack !== "string") {
    return
  }
  const { message, stack } = error
  // Frames are searched for *after* the message, not from the start of `stack`:
  // a wrapped error built as `new Error(`Failed: ${inner.stack}`)` — or any
  // provider message that quotes a stack — carries frame-shaped lines inside
  // its own message, and matching one of those would store message text as
  // frames and push the real throw site past `MAX_STACK_LENGTH`.
  //
  // `indexOf` rather than a fixed `"<Name>: "` prefix length because `name` may
  // have been reassigned; -1 (a `stack` that does not embed its own message —
  // a non-V8 runtime, or a hand-set `stack`) falls back to searching the whole
  // string, which is what a frames-only `stack` needs anyway.
  const messageEnd = message.length > 0 ? stack.indexOf(message) : -1
  const searchFrom = messageEnd === -1 ? 0 : messageEnd + message.length
  const frameStart = stack.slice(searchFrom).search(STACK_FRAME_LINE)
  if (frameStart === -1) {
    return
  }
  // The match is line-anchored, so this keeps the first frame's indentation.
  return stack.slice(
    searchFrom + frameStart,
    searchFrom + frameStart + MAX_STACK_LENGTH,
  )
}
