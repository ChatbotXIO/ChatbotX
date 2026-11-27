// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TargetStatusList } from "@/features/social-posts/components/target-status"
import {
  type ComposerPost,
  resolveComposerLocks,
} from "@/features/social-posts/lib/composer-state"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/lib/orpc/query", () => {
  const procedure = { mutationOptions: (options: object) => options }
  return {
    orpc: {
      socialPostsAPIs: {
        privateDeleteSocialPostAPI: procedure,
        privateResolveSocialPostTargetAPI: procedure,
        privateRemoveSocialPostTargetAPI: procedure,
        privateRetrySocialPostTargetAPI: procedure,
      },
    },
  }
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

const target = (status: string, extra: object = {}) => ({
  destination: { name: "Page" },
  errorCode: null,
  errorMessage: null,
  externalPostId: null,
  id: "t1",
  parts: [],
  permalink: null,
  provider: "facebook",
  removedAt: null,
  status,
  ...extra,
})

const render = (
  status: string,
  disabled: boolean,
  targets: object[] = [target(status)],
) => {
  const post = { id: "p1", targets } as unknown as ComposerPost
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <TargetStatusList disabled={disabled} post={post} workspaceId="w1" />
      </QueryClientProvider>,
    )
  })
}

const button = (text: string): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll("button")).find(
    (item) => item.textContent === text,
  )

describe("resolveComposerLocks", () => {
  test("a published post locks the content but not the actions", () => {
    expect(
      resolveComposerLocks({ editable: false, workspaceReadOnly: false }),
    ).toEqual({ actionsDisabled: false, contentReadOnly: true })
  })

  test("a read-only workspace locks both", () => {
    expect(
      resolveComposerLocks({ editable: true, workspaceReadOnly: true }),
    ).toEqual({ actionsDisabled: true, contentReadOnly: true })
  })

  test("an editable post in a live workspace locks nothing", () => {
    expect(
      resolveComposerLocks({ editable: true, workspaceReadOnly: false }),
    ).toEqual({ actionsDisabled: false, contentReadOnly: false })
  })
})

const buttons = (text: string): HTMLButtonElement[] =>
  Array.from(document.body.querySelectorAll("button")).filter(
    (item) => item.textContent === text,
  )

describe("TargetStatusList actions", () => {
  test("a published destination has its own Remove and, alone, no remove-all", () => {
    render("published", false)
    expect(button("composer.removeTarget")?.disabled).toBe(false)
    expect(button("composer.removeFromAllChannels")).toBeUndefined()
  })

  test("two removable destinations each get Remove, plus Remove from all channels", () => {
    render("published", false, [
      target("published", { id: "t1" }),
      target("published", { id: "t2" }),
    ])
    expect(buttons("composer.removeTarget")).toHaveLength(2)
    expect(button("composer.removeFromAllChannels")?.disabled).toBe(false)
  })

  test("a removed destination offers no Remove and no View post link; the others keep theirs", () => {
    render("published", false, [
      target("published", {
        id: "t1",
        permalink: "https://example.test/1",
        removedAt: "2026-01-01T00:00:00.000Z",
      }),
      target("published", {
        id: "t2",
        permalink: "https://example.test/2",
      }),
    ])
    expect(buttons("composer.removeTarget")).toHaveLength(1)
    expect(button("composer.removeFromAllChannels")).toBeUndefined()
    const links = Array.from(document.body.querySelectorAll("a")).map((item) =>
      item.getAttribute("href"),
    )
    expect(links).toEqual(["https://example.test/2"])
  })

  test("a network without a delete function (TikTok) offers no Remove", () => {
    render("published", false, [target("published", { provider: "tiktok" })])
    expect(button("composer.removeTarget")).toBeUndefined()
  })

  test("a target waiting for review can be retried", () => {
    render("needsReview", false)
    expect(button("composer.retryTarget")?.disabled).toBe(false)
  })

  test("a failed target can be retried", () => {
    render("failed", false)
    expect(button("composer.retryTarget")?.disabled).toBe(false)
  })

  test("a blocked workspace disables removal and retry (402 workspaceBlocked)", () => {
    render("published", true)
    expect(button("composer.removeTarget")?.disabled).toBe(true)
    render("failed", true)
    expect(button("composer.retryTarget")?.disabled).toBe(true)
  })
})
