// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWhatsappOAuthPopup } from "@/features/integration-whatsapp/hooks/use-whatsapp-oauth-popup"
import { WA_OAUTH_RESULT } from "@/features/integration-whatsapp/libs/embedded-signup"

const CALLBACK = "https://broker.test/integrations/whatsapp/callback"
const popup = { closed: false } as unknown as Window

describe("useWhatsappOAuthPopup relay outcomes", () => {
  let container: HTMLDivElement
  let root: Root
  let api: ReturnType<typeof useWhatsappOAuthPopup>
  const onCode = vi.fn()
  const onRelayError = vi.fn()

  function Harness() {
    api = useWhatsappOAuthPopup({
      oauthCallbackUrl: CALLBACK,
      onCode,
      onRelayError,
    })
    return null
  }

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.spyOn(window, "open").mockReturnValue(popup)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<Harness />))
    act(() => {
      api.openPopup("https://facebook.test/dialog")
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    onCode.mockReset()
    onRelayError.mockReset()
  })

  const relay = (status: string) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://broker.test",
          source: popup,
          data: { type: WA_OAUTH_RESULT, status },
        }),
      )
    })

  test("a cancelled dialog stops waiting without reporting a failure", () => {
    expect(api.isWaiting).toBe(true)

    relay("cancelled")

    expect(api.isWaiting).toBe(false)
    expect(onRelayError).not.toHaveBeenCalled()
    expect(onCode).not.toHaveBeenCalled()
  })

  test("a failed dialog still reports the failure", () => {
    relay("error")

    expect(api.isWaiting).toBe(false)
    expect(onRelayError).toHaveBeenCalledTimes(1)
  })
})
