// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refresh: vi.fn(),
  execute: vi.fn(),
  useActionOptions: {} as {
    onSuccess?: () => void
    onError?: (args: { error: { serverError?: string } }) => void
  },
  isPending: { value: false },
  bind: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: typeof mocks.useActionOptions) => {
    mocks.useActionOptions = options
    return { execute: mocks.execute, isPending: mocks.isPending.value }
  },
}))
vi.mock("@/features/integration-whatsapp/actions/connect-capi.action", () => ({
  connectWhatsappCapiAction: { bind: mocks.bind },
}))

const { WhatsappCapiConnectButton } = await import(
  "@/features/integration-whatsapp/components/whatsapp-capi-connect-button"
)

const CALLBACK_URL =
  "https://broker.example.test/integrations/whatsapp/callback"
const settings = {
  clientId: "app-1",
  version: "v25.0",
  configId: "signup-config",
  capiConfigId: "capi-config",
  systemUserId: "su",
  businessName: "Acme",
  verifyToken: "verify",
}

describe("WhatsappCapiConnectButton", () => {
  let container: HTMLDivElement
  let root: Root
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    vi.clearAllMocks()
    mocks.useActionOptions = {}
    mocks.isPending.value = false
    openSpy = vi.spyOn(window, "open").mockReturnValue(window)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    openSpy.mockRestore()
  })

  function render(
    props: Partial<Parameters<typeof WhatsappCapiConnectButton>[0]> = {},
  ) {
    act(() => {
      root.render(
        <WhatsappCapiConnectButton
          integrationWhatsappId="wa-1"
          isCoexist={false}
          oauthCallbackUrl={CALLBACK_URL}
          settings={settings}
          workspaceId="ws-1"
          {...props}
        />,
      )
    })
  }

  const button = () => container.querySelector("button") as HTMLButtonElement
  const click = () =>
    act(() => {
      button().click()
    })
  const relay = (data: unknown, origin = "https://broker.example.test") =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data, origin, source: window }),
      )
    })
  const openedUrl = () => new URL(String(openSpy.mock.calls[0][0]))

  test("labels the button for the Conversions API", () => {
    render()

    expect(button().textContent).toBe("metaConversions.connect.button")
  })

  test("binds the action to the workspace and the integration", () => {
    render()

    expect(mocks.bind).toHaveBeenCalledWith(null, "ws-1", "wa-1")
  })

  test("opens Embedded Signup v4 with the dedicated Conversions API configuration", () => {
    render()
    click()

    const url = openedUrl()
    expect(url.searchParams.get("config_id")).toBe("capi-config")
    expect(url.searchParams.get("client_id")).toBe("app-1")
    expect(url.searchParams.get("auth_type")).toBe("rerequest")
    expect(url.searchParams.get("redirect_uri")).toBe(CALLBACK_URL)
    expect(JSON.parse(url.searchParams.get("extras") ?? "{}")).toMatchObject({
      version: "v4",
    })
    expect(
      JSON.parse(url.searchParams.get("extras") ?? "{}").featureType,
    ).toBeUndefined()
  })

  test("asks for the coexistence screen when the number lives on the WhatsApp Business app", () => {
    render({ isCoexist: true })
    click()

    expect(
      JSON.parse(openedUrl().searchParams.get("extras") ?? "{}").featureType,
    ).toBe("whatsapp_business_app_onboarding")
  })

  test("explains when no Conversions API config id is set, without opening a window", () => {
    render({ settings: { ...settings, capiConfigId: undefined } })
    click()

    expect(mocks.toastError).toHaveBeenCalledWith(
      "metaConversions.errors.capiNotConfigured",
    )
    expect(openSpy).not.toHaveBeenCalled()
  })

  test("treats a missing platform app like a missing config id", () => {
    render({ settings: null })
    click()

    expect(mocks.toastError).toHaveBeenCalledWith("messages.needToAddSettings")
    expect(openSpy).not.toHaveBeenCalled()
  })

  test("tells the admin when the popup was blocked and does not wait for a code", () => {
    openSpy.mockReturnValue(null)
    render()
    click()

    expect(mocks.toastError).toHaveBeenCalledWith(
      "whatsapp.embeddedSignupPopupBlocked",
    )
    expect(button().disabled).toBe(false)
  })

  describe("when the admin closes the tab", () => {
    let isTabClosed = false

    beforeEach(() => {
      isTabClosed = false
      Object.defineProperty(window, "closed", {
        configurable: true,
        get: () => isTabClosed,
      })
      vi.useFakeTimers()
    })
    afterEach(() => {
      Reflect.deleteProperty(window, "closed")
      vi.useRealTimers()
    })

    test("frees the button once the tab is gone and no code arrived", () => {
      render()
      click()
      expect(button().disabled).toBe(true)

      isTabClosed = true
      act(() => {
        vi.advanceTimersByTime(500 + 1500)
      })

      expect(button().disabled).toBe(false)
    })

    test("still takes a code posted just before the tab closed", () => {
      render()
      click()

      isTabClosed = true
      act(() => {
        vi.advanceTimersByTime(500)
      })
      relay({ type: "WA_OAUTH_RESULT", status: "success", code: "late" })

      expect(mocks.execute).toHaveBeenCalledWith({ code: "late" })
    })
  })

  test("ignores a code relayed by a window other than the popup it opened", () => {
    render()
    click()

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "WA_OAUTH_RESULT", status: "success", code: "stale" },
          origin: "https://broker.example.test",
        }),
      )
    })

    expect(mocks.execute).not.toHaveBeenCalled()
  })

  test("submits the relayed code, and only after the popup was opened", () => {
    render()
    relay({ type: "WA_OAUTH_RESULT", status: "success", code: "early" })
    expect(mocks.execute).not.toHaveBeenCalled()

    click()
    expect(button().disabled).toBe(true)
    relay({ type: "WA_OAUTH_RESULT", status: "success", code: "code-1" })

    expect(mocks.execute).toHaveBeenCalledWith({ code: "code-1" })
  })

  test("ignores a message from any origin other than the registered callback", () => {
    render()
    click()
    relay(
      { type: "WA_OAUTH_RESULT", status: "success", code: "forged" },
      "https://evil.example.test",
    )

    expect(mocks.execute).not.toHaveBeenCalled()
  })

  test("reports a failed signup and lets the admin try again", () => {
    render()
    click()
    relay({ type: "WA_OAUTH_RESULT", status: "error" })

    expect(mocks.toastError).toHaveBeenCalledWith("messages.connectFailed")
    expect(button().disabled).toBe(false)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  test("refreshes the page and confirms on success", () => {
    render()
    click()
    act(() => {
      mocks.useActionOptions.onSuccess?.()
    })

    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "metaConversions.connect.success",
    )
    expect(mocks.refresh).toHaveBeenCalled()
    expect(button().disabled).toBe(false)
  })

  test("shows the server's reason and re-enables the button on failure", () => {
    render()
    click()
    act(() => {
      mocks.useActionOptions.onError?.({
        error: { serverError: "(#200) permission" },
      })
    })

    expect(mocks.toastError).toHaveBeenCalledWith("(#200) permission")
    expect(button().disabled).toBe(false)
  })

  test("can be disabled by the caller", () => {
    render({ disabled: true })

    expect(button().disabled).toBe(true)
  })
})
