// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const SESSION_EXPIRED_KEY = "channels.connectMany.sessionError.sessionExpired"

describe("InboxSelectCard error flash", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.history.replaceState(null, "", "/")
  })

  function render(errorMessageKey?: typeof SESSION_EXPIRED_KEY) {
    act(() => {
      root.render(
        <InboxSelectCard
          configuredChannels={["messenger"]}
          errorMessageKey={errorMessageKey}
          offeredChannels={["messenger"]}
        />,
      )
    })
  }

  test("drops the error param from the URL so a reload does not show it again", () => {
    window.history.replaceState(
      null,
      "",
      "/channels/create?workspaceId=12&error=sessionExpired",
    )

    const replaceState = vi.spyOn(window.history, "replaceState")

    render(SESSION_EXPIRED_KEY)

    expect(window.location.pathname).toBe("/channels/create")
    expect(window.location.search).toBe("?workspaceId=12")
    // Next's replaceState wrapper only syncs useSearchParams when the state
    // it receives is not already one of its own (`__NA`), so it must be null.
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/channels/create?workspaceId=12",
    )
    replaceState.mockRestore()
  })

  test("still shows the error once after dropping it from the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/channels/create?error=sessionExpired",
    )

    render(SESSION_EXPIRED_KEY)

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      SESSION_EXPIRED_KEY,
    )
    expect(window.location.search).toBe("")
  })

  test("drops a second error that arrives while the picker stays mounted", () => {
    window.history.replaceState(null, "", "/channels/create?workspaceId=12")
    render()

    // A soft navigation to the same page keeps this component mounted.
    window.history.replaceState(
      null,
      "",
      "/channels/create?workspaceId=12&error=connectFailed",
    )
    render(SESSION_EXPIRED_KEY)

    expect(window.location.search).toBe("?workspaceId=12")
  })

  test("leaves the URL alone when there is no error param", () => {
    window.history.replaceState(null, "", "/channels/create?workspaceId=12")
    const replaceState = vi.spyOn(window.history, "replaceState")

    render()

    expect(replaceState).not.toHaveBeenCalled()
    expect(window.location.search).toBe("?workspaceId=12")
    replaceState.mockRestore()
  })
})
