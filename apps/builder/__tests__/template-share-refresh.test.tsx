// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  execute: vi.fn(),
  // The share action is the first `useAction` the panel creates, rotate the second.
  callbacks: [] as { onSuccess: () => void }[],
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, callbacks: { onSuccess: () => void }) => {
    mocks.callbacks.push(callbacks)
    return { execute: mocks.execute, isPending: false }
  },
}))
vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ appUrl: "https://app.test" }),
}))
vi.mock("@/hooks/use-clipboard", () => ({
  useClipboard: () => ({ handleCopy: vi.fn() }),
}))
vi.mock("@/features/templates/actions/rotate-share-token.action", () => ({
  rotateShareTokenAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/templates/actions/update-share-settings.action", () => ({
  updateShareSettingsAction: { bind: () => vi.fn() },
}))

const { ShareSettingsPanel } = await import(
  "@/features/templates/components/share-settings-panel"
)

describe("share panel refresh", () => {
  let container: HTMLDivElement
  let root: Root
  const onChanged = vi.fn()

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    // base-ui's Switch builds a PointerEvent on click, which jsdom lacks.
    if (!window.PointerEvent) {
      Object.assign(window, { PointerEvent: MouseEvent })
    }
    vi.clearAllMocks()
    mocks.callbacks.length = 0
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <ShareSettingsPanel
            onChanged={onChanged}
            shareUrl="https://app.test/t/tok"
            template={{
              id: "55",
              shareEnabled: false,
              shareToken: "tok",
              shareExpiresAt: null,
            }}
            workspaceId="ws-1"
          />
        </NextIntlClientProvider>,
      ),
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("turning sharing on saves it, and once saved the page is re-read and the host told", () => {
    act(() => container.querySelector<HTMLElement>("[role='switch']")?.click())
    expect(mocks.execute).toHaveBeenCalledWith({
      templateId: "55",
      shareEnabled: true,
    })

    act(() => mocks.callbacks[0]?.onSuccess())

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
