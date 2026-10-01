import type { MessengerAuthValue } from "../schema"

/**
 * Three app ids take part in Messenger conversation routing; they are kept
 * apart on purpose so none can be mistaken for another:
 *
 * - OUR OWN app id — the Meta app this Page is connected through. It is the
 *   OAuth client id stored on the integration's auth (`auth.clientId`), so it
 *   is per integration (white-label tenants bring their own Meta app) and
 *   needs no extra configuration.
 * - the OWNER app id — whichever app holds the thread right now. It is data
 *   (`ContactInbox.threadOwnerAppId`), never configuration.
 * - the RETURN-TARGET app id — the automated-assistant app a thread is handed
 *   back to ("return to bot"). Platform-global config, read here.
 */

/** Env var that may OVERRIDE the Business-AI app id (testing / a non-prod agent). */
export const BUSINESS_AI_APP_ID_ENV = "FACEBOOK_BUSINESS_AI_APP_ID"

/**
 * Meta's Business-AI agent app id — a FIXED, platform-wide constant (Business AI
 * Integration Guide §3.2 / §10). Detection and reactivation always resolve to
 * this, so BizAI is recognised even with no env configured; the env var only
 * overrides it (e.g. pointing tests at a different agent app).
 */
export const BUSINESS_AI_APP_ID = "622851382610562"

/** OUR OWN app id. `null` only if the stored auth carries no client id. */
export const resolveOwnAppId = (
  auth: Pick<MessengerAuthValue, "clientId">,
): string | null => {
  const clientId = auth.clientId?.trim()
  return clientId ? clientId : null
}

/**
 * The Business-AI app id used for detection, "return to bot" and the
 * resume-eligibility check. Meta's agent has a fixed id, so this never returns
 * `null`: an env value overrides it, otherwise the fixed {@link BUSINESS_AI_APP_ID}
 * is used.
 */
export const readBusinessAiAppId = (): string => {
  const value = process.env[BUSINESS_AI_APP_ID_ENV]?.trim()
  return value ? value : BUSINESS_AI_APP_ID
}
