// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CapiConnectCard } from "@/features/meta-conversions/components/capi-connect-card"

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refresh: vi.fn(),
  execute: vi.fn(),
  bind: vi.fn(),
  useActionOptions: {} as {
    onSuccess?: () => void
    onError?: (args: { error: { serverError?: string } }) => void
  },
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

describe("CapiConnectCard", () => {
  let container: HTMLDivElement
  let root: Root
  const connectCustomAction = { bind: mocks.bind }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    vi.clearAllMocks()
    mocks.useActionOptions = {}
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render(datasetId: string | null = null) {
    act(() => {
      root.render(
        <CapiConnectCard
          connectCustomAction={
            connectCustomAction as unknown as Parameters<
              typeof CapiConnectCard
            >[0]["connectCustomAction"]
          }
          connectSlot={<button type="button">connect-slot</button>}
          datasetId={datasetId}
          integrationId="int-1"
          workspaceId="ws-1"
        />,
      )
    })
  }

  const buttonByText = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === text,
    )
  const setInput = (input: HTMLInputElement, value: string) =>
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

  test("leads with the channel's Connect button", () => {
    render()

    expect(container.textContent).toContain("metaConversions.connect.title")
    expect(container.textContent).toContain(
      "metaConversions.connect.description",
    )
    expect(buttonByText("connect-slot")).toBeDefined()
  })

  test("keeps the paste-your-own-token form collapsed until asked for", () => {
    render()

    expect(container.querySelectorAll("input").length).toBe(0)

    act(() => {
      buttonByText("metaConversions.methods.custom.start")?.click()
    })

    expect(container.querySelectorAll("input").length).toBe(2)
  })

  test("binds the custom connect to the workspace and the integration", () => {
    render()

    expect(mocks.bind).toHaveBeenCalledWith(null, "ws-1", "int-1")
  })

  test("prefills the dataset id of a row that already has one", () => {
    render("ds-9")
    act(() => {
      buttonByText("metaConversions.methods.custom.start")?.click()
    })

    const [datasetInput] = Array.from(container.querySelectorAll("input"))
    expect(datasetInput.value).toBe("ds-9")
  })

  test("the custom Connect stays disabled until both fields are filled, then sends them trimmed", () => {
    render()
    act(() => {
      buttonByText("metaConversions.methods.custom.start")?.click()
    })
    const [datasetInput, tokenInput] = Array.from(
      container.querySelectorAll("input"),
    )
    const connect = () =>
      buttonByText(
        "metaConversions.methods.custom.connect",
      ) as HTMLButtonElement

    expect(connect().disabled).toBe(true)
    setInput(datasetInput, " 123 ")
    expect(connect().disabled).toBe(true)
    setInput(tokenInput, " token ")
    expect(connect().disabled).toBe(false)

    act(() => {
      connect().click()
    })

    expect(mocks.execute).toHaveBeenCalledWith({
      datasetId: "123",
      accessToken: "token",
    })
  })

  test("confirms and refreshes after a custom connect, and shows the server's reason on failure", () => {
    render()

    act(() => {
      mocks.useActionOptions.onSuccess?.()
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("metaConversions.connected")
    expect(mocks.refresh).toHaveBeenCalled()

    act(() => {
      mocks.useActionOptions.onError?.({
        error: { serverError: "invalid token" },
      })
    })
    expect(mocks.toastError).toHaveBeenCalledWith("invalid token")
  })
})
