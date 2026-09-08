// Type-only, so this stays a compile-time link with no runtime edge into the
// channel's own module graph: the route's zod schema lives in a zod-only leaf
// module, and a field added there is a type error at every caller.
import type { ConnectWhatsappViaSessionBody } from "@/features/integration-whatsapp/schema/connect-via-session"
import { client } from "@/lib/orpc/orpc"
import type { SetCoexistResponse } from "../schema/coexist"
import type { MessageKey } from "./message-key"

/**
 * The channels that go through the multi-select connect picker + status
 * dialog. This is the ONE table in `features/channel-connect` allowed to
 * hard-code a channel — every other file in this shared feature must read
 * from here instead of listing channels itself.
 */
export const CONNECT_PICKER_CHANNELS = [
  "messenger",
  "instagram",
  "whatsapp",
] as const
export type ConnectPickerChannel = (typeof CONNECT_PICKER_CHANNELS)[number]

/** The route every channel's "session expired, try again" link points to today — shared here so no caller hard-codes it. */
export const CONNECT_RETRY_HREF = "/channels/create"

/**
 * How many accounts the batch connects at once. Bounded on purpose: every
 * request fans out to several Meta Graph calls (list, subscribe, token
 * exchange, follow-ups), so an unbounded batch of 20 would risk the app's
 * per-app rate limit — and the operator gains nothing past a handful of
 * concurrent connects. The transport is an oRPC route rather than a server
 * action precisely so this can be > 1: Next serializes server actions from
 * one browser.
 *
 * **Ceiling — read before raising this, per channel or globally.** Each
 * in-flight connect holds TWO pooled Postgres connections at its peak: one
 * for its own transaction, and a second taken inside it by the quota / usage
 * / tenant writes that run on `db` rather than on the transaction
 * (`inbox/service.ts`'s `tryConsume`, `workspace/service.ts`'s usage
 * increment). So the bound is `2 × concurrency + headroom ≤ pool max`
 * (`packages/database/src/client.ts`'s `max: 10`) — 3 is safe, 5 reaches the
 * cap, and 6 fails on `connectionTimeoutMillis` rather than queueing
 * politely. `connect-pool-ceiling.test.ts` pins it. Raising it means passing
 * `tx` into those writes first, so a connect needs one connection.
 */
export const CONNECT_CONCURRENCY = 3

/**
 * One channel's connect call. `TBody` is the body that channel's procedure
 * accepts, so handing Messenger's route an `{ igId }` is a compile error
 * rather than a runtime 400 the operator sees as a mystery `failed` row.
 */
export type ConnectCall<TBody> = (body: TBody) => Promise<unknown>

/**
 * One channel's connect route. It used to be a URL; it is now the typed oRPC
 * procedure, because `/api` serves only `publicRouter` — a
 * session-authenticated procedure posted there 404s, and a string path cannot
 * be type-checked. `@/lib/orpc/orpc`'s `client` sends these to `/rpc`.
 */
export type ConnectRoute<TBody> = {
  call: ConnectCall<TBody>
}

// Arrow wrappers, never a bare `client.x.y` method reference: the oRPC
// procedure client relies on its receiver, and a detached reference loses it
// (AGENTS.md invariant 13).
const MESSENGER_CONNECT_ROUTE: ConnectRoute<{ pageId: string }> = {
  call: (body) => client.integrationMessengerAPIs.connectMessengerPageAPI(body),
}
const INSTAGRAM_FACEBOOK_CONNECT_ROUTE: ConnectRoute<{ igId: string }> = {
  call: (body) =>
    client.integrationInstagramAPIs.connectInstagramFacebookAccountAPI(body),
}
const WHATSAPP_CONNECT_ROUTE: ConnectRoute<ConnectWhatsappViaSessionBody> = {
  call: (body) => client.integrationWhatsappAPIs.connectWhatsappNumberAPI(body),
}

/**
 * Instagram's other login. It connects the one account behind the direct
 * pending auth, so it is not a picker and has no `CONNECT_CHANNEL_REGISTRY`
 * entry of its own — but its route belongs in this file with every other
 * channel literal.
 */
export const INSTAGRAM_DIRECT_CONNECT_ROUTE: ConnectRoute<{ igId: string }> = {
  call: (body) =>
    client.integrationInstagramAPIs.connectInstagramAccountAPI(body),
}

export type ConnectChannelConfig = {
  /**
   * Requests run through the batch hook this many at a time —
   * `CONNECT_CONCURRENCY` for every channel now that the transport is an
   * oRPC route. The field stays per channel so one provider can be throttled
   * on its own without touching the hook.
   */
  concurrency: number
  /** Toast copy when a picked item is already connected elsewhere. */
  duplicatedKey: MessageKey
  /** Coexist step description, channel-specific. */
  coexistDescriptionKey: MessageKey
  /**
   * The route the picker sends one connect through — the channel's own oRPC
   * procedure, wrapped so no caller names a channel itself and no caller can
   * send the wrong channel's body.
   *
   * `never` rather than `unknown`: a call's body parameter is contravariant,
   * so `ConnectCall<never>` is the one supertype every channel's concrete
   * `ConnectCall<TBody>` satisfies. Each entry keeps its precise `TBody` at
   * the call site through `as const satisfies` below.
   */
  connectRoute: ConnectRoute<never>
  /** e.g. "Messenger page" / "Instagram account" / "WhatsApp number". */
  featureLabelKey: MessageKey
  /** Channel settings route segment, e.g. `settings/channels/<settingsPath>`. */
  settingsPath: string
  /**
   * Link text next to a session-error Alert — read by the shared
   * `ConnectManyDialog`'s batch-level alert (every channel routes through
   * it) so that alert never hard-codes one channel's copy.
   */
  tryAgainKey: MessageKey
  /**
   * `ConnectPickerScreen`'s empty-state Alert copy. Optional — only
   * channels that route through that screen need it today (Messenger,
   * Instagram); WhatsApp's own picker doesn't use it yet.
   */
  emptyTitleKey?: MessageKey
  emptyDescriptionKey?: MessageKey
}

export const CONNECT_CHANNEL_REGISTRY = {
  messenger: {
    concurrency: CONNECT_CONCURRENCY,
    connectRoute: MESSENGER_CONNECT_ROUTE,
    duplicatedKey: "channels.duplicated.messenger",
    coexistDescriptionKey: "coexist.descriptionMessenger",
    featureLabelKey: "fields.messenger.label",
    settingsPath: "messenger",
    tryAgainKey: "messenger.selectPage.tryAgain",
    emptyTitleKey: "messenger.selectPage.noPagesTitle",
    emptyDescriptionKey: "messenger.selectPage.noPagesDescription",
  },
  instagram: {
    concurrency: CONNECT_CONCURRENCY,
    connectRoute: INSTAGRAM_FACEBOOK_CONNECT_ROUTE,
    duplicatedKey: "channels.duplicated.instagram",
    coexistDescriptionKey: "coexist.descriptionInstagram",
    featureLabelKey: "fields.instagram.label",
    settingsPath: "instagram",
    tryAgainKey: "instagram.selectPage.tryAgain",
    emptyTitleKey: "instagram.selectPage.noAccountsTitle",
    emptyDescriptionKey: "instagram.selectPage.noAccountsDescription",
  },
  whatsapp: {
    // 1, not `CONNECT_CONCURRENCY`: the per-number connect also runs
    // WABA-level setup (`addSystemUser` / `shareCreditLine` /
    // `subscribeWebhook`), and every number in one signup session shares the
    // same WABA — so three parallel numbers would fire three overlapping
    // writes at one WABA. Meta documents `assigned_users`/`subscribed_apps`
    // as idempotent, but a concurrent duplicate that answers with an error
    // would surface as `providerRejected` on numbers 2..N, and nothing here
    // has proven otherwise. Sequential until a Meta smoke with 2+ numbers on
    // one WABA says it is safe. Follow-up: run the WABA-level setup once per
    // session instead of once per number, then raise this.
    concurrency: 1,
    connectRoute: WHATSAPP_CONNECT_ROUTE,
    duplicatedKey: "channels.duplicated.whatsapp",
    coexistDescriptionKey: "coexist.descriptionWhatsapp",
    featureLabelKey: "fields.whatsapp.label",
    settingsPath: "whatsapp",
    tryAgainKey: "whatsapp.selectPage.tryAgain",
  },
} as const satisfies Record<ConnectPickerChannel, ConnectChannelConfig>

/** The body every coexist procedure accepts — one shape across the three channels. */
export type SetCoexistBody = {
  workspaceId: string
  integrationId: string
  enabled: boolean
  aiReadsSyncedHistory: boolean
}

/** One channel's coexist call. */
export type CoexistSetter = (
  body: SetCoexistBody,
) => Promise<SetCoexistResponse>

/**
 * Coexist's per-channel dispatch, in this file for the same reason the connect
 * routes are: it is the ONE table allowed to name a channel, so
 * `lib/coexist-client.ts` stays channel-agnostic and no caller builds a
 * channel-shaped URL. Arrow wrappers, never bare `client.x.y` references —
 * the procedure client relies on its receiver (AGENTS.md invariant 13).
 */
export const COEXIST_SETTERS = {
  messenger: (body) =>
    client.integrationMessengerAPIs.setCoexistMessengerAPI(body),
  instagram: (body) =>
    client.integrationInstagramAPIs.setCoexistInstagramAPI(body),
  whatsapp: (body) =>
    client.integrationWhatsappAPIs.setCoexistWhatsappAPI(body),
} as const satisfies Record<ConnectPickerChannel, CoexistSetter>
