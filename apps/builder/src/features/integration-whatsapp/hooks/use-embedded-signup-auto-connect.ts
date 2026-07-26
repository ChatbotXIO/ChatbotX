"use client"

import { useCallbackRef } from "@chatbotx.io/ui/hooks/use-callback-ref"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { getBrokerOrigin } from "@/lib/oauth-broker"
import {
  WA_OAUTH_RESULT,
  type WhatsappOAuthRelayResult,
} from "../libs/embedded-signup"
import { FORM_FIELDS } from "../libs/form-fields"
import type { ConnectWhatsappSchema } from "../schemas"
import { useAutoSubmitCountdown } from "./use-auto-submit-countdown"

type UseEmbeddedSignupAutoConnectParams = {
  /** Seconds the user sees before the connect submits itself. */
  delaySeconds: number
  /** A failed connect hands the flow back to the user for a fresh signup. */
  hasFailed: boolean
  /** Submits the connect form. Called once, with no event. */
  onSubmit: () => void
  /** The relay reported a failed signup; the caller owns the localized message. */
  onRelayError: () => void
}

type EmbeddedSignupAutoConnect = {
  /** True from the moment Meta returns a code until the connect resolves. */
  isConnecting: boolean
  /** Seconds still to wait; `0` once the submit is in flight. */
  secondsLeft: number
}

/**
 * Drives everything that happens after the Meta embedded signup closes.
 *
 * The Facebook OAuth dialog redirects the `code` to the broker callback, which
 * relays it back to this tab via `postMessage` — the FB JS SDK cannot be used
 * here because its OAuth origin is bound to `window.location`, which breaks
 * white-label custom domains. Once the code lands there is nothing left for the
 * user to fill in (the WABA / phone / business ids are derived server-side from
 * the token), so the connect submits itself after a short, visible delay.
 *
 * The form is the single source of truth: `code` alone gates the countdown, so
 * clearing it is all it takes to return to the launch button. A consumed OAuth
 * code can never be exchanged again, which is why a failed connect drops it
 * instead of leaving the user in front of a permanently disabled control.
 */
export function useEmbeddedSignupAutoConnect({
  delaySeconds,
  hasFailed,
  onSubmit,
  onRelayError,
}: UseEmbeddedSignupAutoConnectParams): EmbeddedSignupAutoConnect {
  const { control, setValue } = useFormContext<ConnectWhatsappSchema>()
  const code = useWatch({ control, name: FORM_FIELDS.CODE })
  const handleRelayError = useCallbackRef(onRelayError)

  useEffect(() => {
    const brokerOrigin = getBrokerOrigin()

    // Any window on the page can post here, so the broker origin is the only
    // trusted sender — everything else is dropped without a word.
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== brokerOrigin) {
        return
      }

      const relayed = event.data as WhatsappOAuthRelayResult | undefined
      if (relayed?.type !== WA_OAUTH_RESULT) {
        return
      }

      if (relayed.status === "success" && relayed.code) {
        setValue(FORM_FIELDS.CODE, relayed.code)
        return
      }

      handleRelayError()
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [handleRelayError, setValue])

  useEffect(() => {
    if (!hasFailed) {
      return
    }
    setValue(FORM_FIELDS.CODE, "")
  }, [hasFailed, setValue])

  const secondsLeft = useAutoSubmitCountdown({
    active: Boolean(code),
    seconds: delaySeconds,
    onElapsed: onSubmit,
  })

  return { isConnecting: Boolean(code), secondsLeft }
}
