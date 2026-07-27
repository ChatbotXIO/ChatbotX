import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import type { NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"
import {
  decodeOAuthState,
  WA_OAUTH_RESULT,
  type WhatsappOAuthRelayResult,
} from "@/features/integration-whatsapp/libs/embedded-signup"
import { logger } from "@/lib/log"
import { sanitizeReferer } from "@/lib/oauth-referer"

export const dynamic = "force-dynamic"

const SUPPORTED_LOCALES = new Set(["en", "vi"])

// Characters that could break out of an inline <script>: `<` (so `</script>`
// can't close the tag) and the JS line terminators U+2028 / U+2029 (emitted raw
// by JSON.stringify, but valid line breaks in older parsers).
const SCRIPT_BREAKOUT_RE = /[<\u2028\u2029]/g
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
}
const HTML_ESCAPE_RE = /[&<>"]/g

/** Safe to embed inside an inline <script>. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    SCRIPT_BREAKOUT_RE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  )
}

/** Safe to embed in HTML text content. */
function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPES[c] ?? c)
}

function relayHtml(params: {
  result: WhatsappOAuthRelayResult
  targetOrigin: string
  message: string
}): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>WhatsApp</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 24px; text-align: center;">
    <p>${escapeHtml(params.message)}</p>
    <script>
      (function () {
        try {
          if (window.opener) {
            window.opener.postMessage(${safeJson(params.result)}, ${safeJson(params.targetOrigin)});
          }
        } catch (e) {}
        window.setTimeout(function () { window.close(); }, 300);
      })();
    </script>
  </body>
</html>`
}

// This relay page frames nothing and is framed by nothing; its only script is the
// inline relay above. Lock it down accordingly. If a nonce-based CSP is added app
// wide later, plumb the nonce in here instead of `'unsafe-inline'`.
const RELAY_RESPONSE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'",
} as const

/**
 * Broker callback for WhatsApp embedded signup. Facebook redirects the OAuth
 * `code` here (the only Meta-registered `redirect_uri`). This route runs on the
 * broker host, relays the `code` back to the originating reseller tab via
 * `window.opener.postMessage` — targeting the reseller origin carried in `state`
 * and validated against origins we control — then closes the popup. The reseller
 * tab, where the session cookie lives, exchanges the code and finishes the
 * connect. No DB access, no token exchange happens here.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(getPublicUrlFromRequest(req))
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")
  const state = decodeOAuthState(url.searchParams.get("state") ?? "")

  if (!state) {
    logger.warn("[wa-oauth-callback] missing or invalid state")
    return new Response("Invalid request", { status: 400 })
  }

  // sanitizeReferer returns the input only when it is an origin we control
  // (broker host, builder host, or an active custom domain); otherwise a safe
  // in-app path. We must not postMessage a `code` to an unknown origin.
  const safeReferer = await sanitizeReferer(state.referer)
  if (!safeReferer.startsWith("http")) {
    logger.warn(
      { referer: state.referer },
      "[wa-oauth-callback] rejected relay target",
    )
    return new Response("Invalid request", { status: 400 })
  }

  const targetOrigin = new URL(safeReferer).origin
  const locale = SUPPORTED_LOCALES.has(state.locale ?? "")
    ? (state.locale as string)
    : "en"
  const t = await getTranslations({ locale, namespace: "whatsapp" })

  const result: WhatsappOAuthRelayResult =
    code && !error
      ? { type: WA_OAUTH_RESULT, status: "success", code }
      : { type: WA_OAUTH_RESULT, status: "error" }

  return new Response(
    relayHtml({
      result,
      targetOrigin,
      message: t("embeddedSignupDone"),
    }),
    { headers: RELAY_RESPONSE_HEADERS },
  )
}
