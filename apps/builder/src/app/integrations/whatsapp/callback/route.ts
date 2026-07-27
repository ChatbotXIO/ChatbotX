import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import type { NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"
import {
  buildEmbeddedSignupExtras,
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

function launcherHtml(params: {
  clientId: string
  configId: string
  version: string
  extras: Record<string, unknown>
  targetOrigin: string
  loadingMessage: string
  continueLabel: string
  failedMessage: string
}): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>WhatsApp</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 24px; text-align: center;">
    <p id="status">${escapeHtml(params.loadingMessage)}</p>
    <button id="continue" disabled style="border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer;">${escapeHtml(params.continueLabel)}</button>
    <script>
      (function () {
        var selection = {};
        var status = document.getElementById("status");
        var button = document.getElementById("continue");
        var targetOrigin = ${safeJson(params.targetOrigin)};

        function relay(result) {
          try {
            if (window.opener) {
              window.opener.postMessage(result, targetOrigin);
            }
          } catch (e) {}
          window.setTimeout(function () { window.close(); }, 300);
        }

        function readString(value, key) {
          return value && typeof value[key] === "string" ? value[key] : undefined;
        }

        function rememberSelection(data) {
          var phoneNumberId = readString(data, "phone_number_id") || readString(data, "phoneNumberId");
          var wabaId = readString(data, "waba_id") || readString(data, "wabaId");
          if (phoneNumberId) {
            selection.phoneNumberId = phoneNumberId;
          }
          if (wabaId) {
            selection.wabaId = wabaId;
          }
        }

        window.addEventListener("message", function (event) {
          var hostname = "";
          try {
            hostname = new URL(event.origin).hostname;
          } catch (e) {
            return;
          }
          if (!/\\.facebook\\.com$/.test(hostname)) {
            return;
          }

          var payload = event.data;
          if (typeof payload === "string") {
            try {
              payload = JSON.parse(payload);
            } catch (e) {
              return;
            }
          }
          if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") {
            return;
          }

          rememberSelection(payload.data || {});
        });

        window.fbAsyncInit = function () {
          FB.init({
            appId: ${safeJson(params.clientId)},
            version: ${safeJson(params.version)},
            xfbml: false,
            cookie: false
          });
          button.disabled = false;
        };

        button.addEventListener("click", function () {
          button.disabled = true;
          FB.login(function (response) {
            var code = response && response.authResponse && response.authResponse.code;
            if (!code) {
              status.textContent = ${safeJson(params.failedMessage)};
              relay({ type: ${safeJson(WA_OAUTH_RESULT)}, status: "error" });
              return;
            }

            relay({
              type: ${safeJson(WA_OAUTH_RESULT)},
              status: "success",
              code: code,
              codeSource: "sdk",
              phoneNumberId: selection.phoneNumberId,
              wabaId: selection.wabaId
            });
          }, {
            config_id: ${safeJson(params.configId)},
            response_type: "code",
            override_default_response_type: true,
            extras: ${safeJson(params.extras)}
          });
        });
      })();
    </script>
    <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>
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

const LAUNCHER_RESPONSE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'none'; script-src 'unsafe-inline' https://connect.facebook.net; connect-src https://www.facebook.com https://graph.facebook.com; frame-src https://www.facebook.com; style-src 'unsafe-inline'; frame-ancestors 'none'",
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
  const clientId = url.searchParams.get("client_id")
  const configId = url.searchParams.get("config_id")
  const version = url.searchParams.get("version")

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

  if (!(code || error)) {
    if (!(clientId && configId && version)) {
      logger.warn("[wa-oauth-callback] missing launcher params")
      return new Response("Invalid request", { status: 400 })
    }

    let extras: Record<string, unknown> = buildEmbeddedSignupExtras()
    try {
      const rawExtras = url.searchParams.get("extras")
      if (rawExtras) {
        const parsedExtras = JSON.parse(rawExtras) as unknown
        if (parsedExtras && typeof parsedExtras === "object") {
          extras = parsedExtras as Record<string, unknown>
        }
      }
    } catch {
      logger.warn("[wa-oauth-callback] invalid launcher extras")
    }

    return new Response(
      launcherHtml({
        clientId,
        configId,
        version,
        extras,
        targetOrigin,
        loadingMessage: t("embeddedSignupLoading"),
        continueLabel: t("embeddedSignupContinue"),
        failedMessage: t("embeddedSignupFailed"),
      }),
      { headers: LAUNCHER_RESPONSE_HEADERS },
    )
  }

  const result: WhatsappOAuthRelayResult =
    code && !error
      ? {
          type: WA_OAUTH_RESULT,
          status: "success",
          code,
          codeSource: "redirect",
        }
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
