// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { OAuthErrorAlert } from "@/features/auth/components/oauth-error-alert"

// Mirrors Next's App Router: `useSearchParams` follows `history.replaceState`.
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  const listeners = new Set<() => void>()
  const original = window.history.replaceState.bind(window.history)
  window.history.replaceState = (...args) => {
    original(...args)
    for (const listener of listeners) {
      listener()
    }
  }
  return {
    useSearchParams: () => {
      const search = useSyncExternalStore(
        (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        () => window.location.search,
      )
      return new URLSearchParams(search)
    },
  }
})

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

describe("OAuthErrorAlert", () => {
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

  const render = () => act(() => root.render(<OAuthErrorAlert />))

  test("shows the error once and drops it from the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/auth/sign-in?error=state_mismatch&plan=pro",
    )

    render()

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "auth.oauthError.sessionExpired",
    )
    expect(window.location.search).toBe("?plan=pro")
  })

  test("drops a nested error but keeps the callbackURL", () => {
    window.history.replaceState(
      null,
      "",
      `/auth/sign-in?callbackURL=${encodeURIComponent("/space/1?error=access_denied")}`,
    )

    render()

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "auth.oauthError.accessDenied",
    )
    expect(new URLSearchParams(window.location.search).get("callbackURL")).toBe(
      "/space/1",
    )
  })

  test("renders nothing and leaves the URL alone without an error", () => {
    window.history.replaceState(null, "", "/auth/sign-in?plan=pro")

    render()

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(window.location.search).toBe("?plan=pro")
  })
})
