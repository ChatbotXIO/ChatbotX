// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CapiConnectButton } from "@/features/meta-conversions/components/capi-connect-button"

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  execute: vi.fn(),
  bind: vi.fn(),
  isPending: { value: false },
  useActionOptions: {} as {
    onError?: (args: { error: { serverError?: string } }) => void
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: unknown, options: typeof mocks.useActionOptions) => {
    mocks.useActionOptions = options
    return {
      execute: mocks.execute,
      isPending: mocks.isPending.value,
      action,
    }
  },
}))

describe("CapiConnectButton", () => {
  let container: HTMLDivElement
  let root: Root
  const connectAction = { bind: mocks.bind }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    vi.clearAllMocks()
    mocks.isPending.value = false
    mocks.bind.mockReturnValue("bound-connect")
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render(props: { isReconnect?: boolean } = {}) {
    act(() => {
      root.render(
        <CapiConnectButton
          connectAction={
            connectAction as unknown as Parameters<
              typeof CapiConnectButton
            >[0]["connectAction"]
          }
          integrationId="int-1"
          workspaceId="ws-1"
          {...props}
        />,
      )
    })
  }

  const button = () => container.querySelector("button") as HTMLButtonElement

  test("labels the button and binds the action to the workspace and integration", () => {
    render()

    expect(button().textContent).toBe("metaConversions.connect.button")
    expect(mocks.bind).toHaveBeenCalledWith(null, "ws-1", "int-1")
  })

  test("labels the button Reconnect for a setup that only needs its permission renewed", () => {
    render({ isReconnect: true })

    expect(button().textContent).toBe("metaConversions.connect.reconnect")
  })

  test("starts the connect with no arguments", () => {
    render()
    act(() => {
      button().click()
    })

    expect(mocks.execute).toHaveBeenCalledWith()
  })

  test("is disabled and shows progress while the connect is starting", () => {
    mocks.isPending.value = true
    render()

    expect(button().disabled).toBe(true)
    expect(button().querySelector("svg")).not.toBeNull()
  })

  test("shows the server's reason when the connect cannot start", () => {
    render()
    act(() => {
      mocks.useActionOptions.onError?.({
        error: { serverError: "app not configured" },
      })
    })

    expect(mocks.toastError).toHaveBeenCalledWith("app not configured")
  })

  test("falls back to a generic message when the server gives no reason", () => {
    render()
    act(() => {
      mocks.useActionOptions.onError?.({ error: {} })
    })

    expect(mocks.toastError).toHaveBeenCalledWith(
      "metaConversions.errors.saveFailed",
    )
  })
})
