// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refresh: vi.fn(),
  invalidateInboxes: vi.fn(),
  execute: vi.fn(),
  useActionOptions: {} as {
    onSuccess?: () => void
    onError?: (args: { error: { serverError?: string } }) => void
  },
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
    return { execute: mocks.execute, isPending: false }
  },
}))
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInvalidateInboxes: () => mocks.invalidateInboxes,
}))
vi.mock("@/features/integration-whatsapp/actions/reconnect.action", () => ({
  reconnectWhatsappAction: { bind: mocks.bind },
}))

const { WhatsappReconnectButton } = await import(
  "@/features/integration-whatsapp/components/whatsapp-reconnect-button"
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

describe("WhatsappReconnectButton", () => {
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
    openSpy = vi.spyOn(window, "open").mockReturnValue(window)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    openSpy.mockRestore()
  })

  function render(isCoexist = false) {
    act(() => {
      root.render(
        <WhatsappReconnectButton
          integrationWhatsappId="wa-1"
          isCoexist={isCoexist}
          oauthCallbackUrl={CALLBACK_URL}
          settings={settings}
          workspaceId="ws-1"
        />,
      )
    })
  }

  const button = () => container.querySelector("button") as HTMLButtonElement
  const click = () =>
    act(() => {
      button().click()
    })
  const relay = (data: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: "https://broker.example.test",
          source: window,
        }),
      )
    })

  test("reconnects with the channel's own Embedded Signup configuration on v4", () => {
    render()
    click()

    const url = new URL(String(openSpy.mock.calls[0][0]))
    expect(url.searchParams.get("config_id")).toBe("signup-config")
    expect(url.searchParams.get("auth_type")).toBe("rerequest")
    expect(JSON.parse(url.searchParams.get("extras") ?? "{}")).toMatchObject({
      version: "v4",
    })
  })

  test("submits the relayed code once the popup is open", () => {
    render()
    click()
    relay({ type: "WA_OAUTH_RESULT", status: "success", code: "code-1" })

    expect(mocks.execute).toHaveBeenCalledWith({ code: "code-1" })
    expect(button().disabled).toBe(true)
  })

  test("refreshes inboxes and the page when the reconnect succeeds", () => {
    render()
    click()
    act(() => {
      mocks.useActionOptions.onSuccess?.()
    })

    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "ads.connectAccounts.reconnectSuccess",
    )
    expect(mocks.invalidateInboxes).toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
    expect(button().disabled).toBe(false)
  })

  test("reports a failed signup and re-enables the button", () => {
    render()
    click()
    relay({ type: "WA_OAUTH_RESULT", status: "error" })

    expect(mocks.toastError).toHaveBeenCalledWith("messages.connectFailed")
    expect(button().disabled).toBe(false)
  })

  test("tells the admin when the popup was blocked", () => {
    openSpy.mockReturnValue(null)
    render()
    click()

    expect(mocks.toastError).toHaveBeenCalledWith(
      "whatsapp.embeddedSignupPopupBlocked",
    )
    expect(button().disabled).toBe(false)
  })
})
