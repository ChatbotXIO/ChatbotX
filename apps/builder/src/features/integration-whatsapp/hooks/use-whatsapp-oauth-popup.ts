"use client"

import { useCallbackRef } from "@chatbotx.io/ui/hooks/use-callback-ref"
import { useCallback, useEffect, useRef, useState } from "react"
import { parseOAuthRelayResult } from "../libs/oauth-relay"

type UseWhatsappOAuthPopupParams = {
  /**
   * The origin the OAuth callback route was registered on for this credential
   * (broker or the reseller's own custom domain) — the only trusted
   * `postMessage` sender. See `lib/provider-origin.ts`.
   */
  oauthCallbackUrl: string
  /** Called once per relayed code while a popup is open. */
  onCode: (code: string) => void
  /** The relay reported a failed signup; the caller owns the localized message. */
  onRelayError: () => void
}

/** How often the opened tab is checked for being closed by the user. */
const POPUP_CLOSED_POLL_MS = 500
/** A relayed code is posted just before the tab closes; give it time to land. */
const POPUP_CLOSED_GRACE_MS = 1500

type WhatsappOAuthPopup = {
  /** True from the moment the popup opens until `stopWaiting`, a relayed error, or the tab being closed without a code. */
  isWaiting: boolean
  /** Opens the dialog in a real tab; `false` when the browser blocked it. */
  openPopup: (url: string) => boolean
  /** The code was consumed (or failed): return the launch button to its idle state. */
  stopWaiting: () => void
}

/**
 * The popup half of every Embedded Signup flow that finishes in a server action.
 *
 * The Facebook OAuth dialog redirects the `code` to the registered callback,
 * which relays it back to this tab via `postMessage` — the FB JS SDK cannot be
 * used because its OAuth origin is bound to `window.location`, which breaks
 * white-label custom domains. A message is only honoured while a popup this tab
 * opened is outstanding, so an unsolicited message can never submit a code.
 */
export function useWhatsappOAuthPopup({
  oauthCallbackUrl,
  onCode,
  onRelayError,
}: UseWhatsappOAuthPopupParams): WhatsappOAuthPopup {
  const [isWaiting, setIsWaitingState] = useState(false)
  const isWaitingRef = useRef(false)
  const setIsWaiting = useCallback((waiting: boolean) => {
    isWaitingRef.current = waiting
    setIsWaitingState(waiting)
  }, [])
  const popupRef = useRef<Window | null>(null)
  const handleCode = useCallbackRef(onCode)
  const handleRelayError = useCallbackRef(onRelayError)

  useEffect(() => {
    const expectedOrigin = new URL(oauthCallbackUrl).origin
    const handleMessage = (event: MessageEvent) => {
      const result = parseOAuthRelayResult({
        origin: event.origin,
        expectedOrigin,
        data: event.data,
      })
      // Only the tab this hook opened may answer: a code relayed by an earlier
      // popup (or one another button opened) must never reach this handler.
      if (
        result.type === "ignored" ||
        !isWaitingRef.current ||
        event.source !== popupRef.current
      ) {
        return
      }

      if (result.type === "success") {
        handleCode(result.code)
        return
      }

      setIsWaiting(false)
      handleRelayError()
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [oauthCallbackUrl, handleCode, handleRelayError, setIsWaiting])

  // Closing the tab without finishing the dialog relays nothing, which would
  // leave the launch button busy until a reload.
  useEffect(() => {
    if (!isWaiting) {
      return
    }
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    const pollTimer = setInterval(() => {
      if (!popupRef.current?.closed) {
        return
      }
      clearInterval(pollTimer)
      graceTimer = setTimeout(() => setIsWaiting(false), POPUP_CLOSED_GRACE_MS)
    }, POPUP_CLOSED_POLL_MS)

    return () => {
      clearInterval(pollTimer)
      clearTimeout(graceTimer)
    }
  }, [isWaiting, setIsWaiting])

  const openPopup = useCallback(
    (url: string) => {
      const popup = window.open(url, "_blank")
      if (!popup) {
        return false
      }
      popupRef.current = popup
      setIsWaiting(true)
      return true
    },
    [setIsWaiting],
  )

  const stopWaiting = useCallback(() => setIsWaiting(false), [setIsWaiting])

  return { isWaiting, openPopup, stopWaiting }
}
