import {
  type HandleRequestProps,
  type ReceivedMessageProps,
  SdkException,
} from "@chatbotx.io/sdk"
import type { OnMessageArgs, OnStatusArgs } from "whatsapp-api-js/emitters"
import { WhatsAppAPI as Middleware } from "whatsapp-api-js/middleware/next"
import type { GetParams } from "whatsapp-api-js/types"
import { DEFAULT_API_VERSION } from "../constants"
import type { WhatsappConfig } from "../schema"

/** One buffered Coexistence history slice keyed by its phone number. */
type CoexistPayload = { phoneNumberId: string; value: unknown }

/**
 * Per Meta docs, coexist payloads arrive under three distinct `field` values
 * — not nested inside `messages`. Each field carries a differently-named
 * array on `value`:
 *
 *   field: "history"            → value.history[]            (legacy chat history)
 *   field: "smb_app_state_sync" → value.state_sync[]         (contact backfill)
 *   field: "smb_message_echoes" → value.message_echoes[]     (live SMB messages)
 *
 * Legacy `value.smb_app_state_sync` and `value.history` forms (older Meta
 * shapes) are kept as fallbacks so old samples still parse.
 */
const COEXIST_FIELD_KEY: Record<string, string> = {
  history: "history",
  smb_app_state_sync: "state_sync",
  smb_message_echoes: "message_echoes",
}

export const extractCoexistPayloads = (rawBody: unknown): CoexistPayload[] => {
  if (typeof rawBody !== "object" || rawBody === null) {
    return []
  }
  const entries = (rawBody as { entry?: unknown }).entry
  if (!Array.isArray(entries)) {
    return []
  }

  const payloads: CoexistPayload[] = []
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown }).changes
    if (!Array.isArray(changes)) {
      continue
    }
    for (const change of changes) {
      const value = (change as { value?: unknown }).value
      if (typeof value !== "object" || value === null) {
        continue
      }
      const typed = value as {
        history?: unknown
        state_sync?: unknown
        message_echoes?: unknown
        smb_app_state_sync?: unknown
        metadata?: { phone_number_id?: unknown }
      }
      const field = (change as { field?: unknown }).field
      const fieldKey =
        typeof field === "string" ? COEXIST_FIELD_KEY[field] : undefined

      const isCoexist =
        (fieldKey !== undefined &&
          Array.isArray((typed as Record<string, unknown>)[fieldKey])) ||
        Array.isArray(typed.history) ||
        Array.isArray(typed.smb_app_state_sync)

      const phoneNumberId = typed.metadata?.phone_number_id
      if (isCoexist && typeof phoneNumberId === "string") {
        payloads.push({ phoneNumberId, value })
      }
    }
  }
  return payloads
}

export const webhookHandler = async (
  props: HandleRequestProps<WhatsappConfig>,
) => {
  const { version = DEFAULT_API_VERSION } = props.config
  const middleware = new Middleware({
    token: "",
    appSecret: props.config.clientSecret as string,
    webhookVerifyToken: props.config.verifyToken as string,
    v: version as string,
    secure: true,
  })

  if (props.req.method === "GET") {
    const url = new URL(props.req.url)
    const params = Object.fromEntries(url.searchParams.entries()) as GetParams
    return await middleware.get(params)
  }

  if (props.req.method === "POST") {
    try {
      // Read the body once as raw bytes — HTTP body is a one-shot stream.
      // Using arrayBuffer() preserves the exact bytes for HMAC verification;
      // text() would silently re-encode, risking a signature mismatch on
      // non-ASCII payloads. We decode to string only for JSON parsing.
      let rawBodyBuffer = new ArrayBuffer(0)
      let rawBodyText = ""
      let coexistPayloads: CoexistPayload[] = []
      try {
        rawBodyBuffer = await props.req.arrayBuffer()
        rawBodyText = new TextDecoder().decode(rawBodyBuffer)
        const rawBody = JSON.parse(rawBodyText) as unknown
        coexistPayloads = extractCoexistPayloads(rawBody)
      } catch {
        // Body was not JSON — ignore and continue.
      }

      const reqWithBody = new Request(props.req.url, {
        method: props.req.method,
        headers: props.req.headers,
        body: rawBodyBuffer.byteLength > 0 ? rawBodyBuffer : undefined,
      })

      // Start handle_post immediately; attach a no-op catch so any rejection
      // that arrives after we've already resolved the race is silently absorbed
      // (we re-check the outcome below via the full await).
      const handlePostPromise = middleware.handle_post(reqWithBody)
      handlePostPromise.catch(() => {
        /* absorbed — re-checked below */
      })

      const result = await new Promise<
        | { type: "message"; data: OnMessageArgs }
        | { type: "status"; data: OnStatusArgs }
        | null
      >((resolve) => {
        middleware.on.message = (args: OnMessageArgs) => {
          resolve({ type: "message", data: args })
        }
        middleware.on.sent = () => {
          resolve(null)
        }
        middleware.on.status = (args: OnStatusArgs) => {
          resolve({ type: "status", data: args })
        }

        // 300 ms guard: resolve with null so callers aren't blocked forever.
        setTimeout(() => {
          resolve(null)
        }, 300)
      })

      // Always await handle_post to completion so hmacVerified reflects the
      // actual HMAC outcome — even if the middleware callbacks fired first or
      // the 300 ms guard already resolved the inner promise above.
      const handlePostStatus = await handlePostPromise
      if (handlePostStatus !== 200) {
        throw new SdkException("Failed to handle webhook")
      }

      if (coexistPayloads.length > 0) {
        for (const { phoneNumberId, value } of coexistPayloads) {
          await props.queue?.add("coexistWhatsappBuffer", {
            type: "coexistWhatsappBuffer",
            data: { phoneNumberId, payload: value },
          })
        }
      }

      if (result?.type === "message" && result.data.message) {
        await props.queue?.add("incomingMessage", {
          type: "incomingMessage",
          data: {
            integrationType: "whatsapp",
            integrationIdentifier: result.data.phoneID,
            payload: result.data,
          } as ReceivedMessageProps,
        })
      }

      if (result?.type === "status") {
        const statusData = result.data

        if (
          statusData.status === "delivered" ||
          statusData.status === "failed" ||
          statusData.status === "read"
        ) {
          await props.queue?.add("messageStatus", {
            type: "messageStatus",
            data: {
              integrationIdentifier: result.data.phoneID,
              integrationType: "whatsapp",
              payload: {
                phoneID: result.data.phoneID,
                phone: result.data.phone,
                messageId: statusData.id,
                status: statusData.status,
                timestamp: statusData.timestamp,
                error: result.data.error,
              },
            },
          })
        }
      }

      return "ok"
    } catch {
      throw new SdkException("Failed to handle webhook")
    }
  }

  throw SdkException.methodNotImplemented()
}
