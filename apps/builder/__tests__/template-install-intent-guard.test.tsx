// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  clear: vi.fn(() => Promise.resolve()),
  pathname: "/",
}))

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("@/features/templates/actions/template-install-intent.action", () => ({
  clearTemplateInstallIntentAction: mocks.clear,
}))

const { TemplateInstallIntentGuard } = await import(
  "@/features/templates/components/template-install-intent-guard"
)
const { continuesInstallIntent, isChannelFlowPath } = await import(
  "@/features/templates/lib/install-intent-marker"
)

describe("template install intent guard", () => {
  let root: Root
  const cookieIs = (value: string) =>
    vi.spyOn(document, "cookie", "get").mockReturnValue(value)

  const open = (pathname: string) => {
    mocks.pathname = pathname
    act(() => root.render(<TemplateInstallIntentGuard />))
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    cookieIs("template-install-intent=1")
    root = createRoot(document.createElement("div"))
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  test.each([
    "/channels/create",
    "/channels/instagram",
    "/connect/abc",
    "/auth/sign-in",
  ])("keeps the choice on %s, a step of creating a workspace", (pathname) => {
    open(pathname)

    expect(mocks.clear).not.toHaveBeenCalled()
  })

  test.each([
    "/",
    "/space/1/dashboard",
    "/admin/workspaces",
    "/t/tok",
  ])("ends the choice on %s", (pathname) => {
    open(pathname)

    expect(mocks.clear).toHaveBeenCalledTimes(1)
  })

  test("does nothing with no choice pending", () => {
    cookieIs("other=1")

    open("/space/1/dashboard")

    expect(mocks.clear).not.toHaveBeenCalled()
  })

  test.each([
    ["the share page's flow", { fromTemplate: "1" }, true],
    ["the workspace switcher or a failed connect", {}, false],
    [
      "adding a channel to an existing workspace",
      { fromTemplate: "1", workspaceId: "5" },
      false,
    ],
    ["a channel settings link", { workspaceId: "5" }, false],
  ])("/channels/create from %s", (_name, query, expected) => {
    expect(continuesInstallIntent(query)).toBe(expected)
  })

  test("a path merely starting alike is not part of the flow", () => {
    expect(isChannelFlowPath("/channels-old")).toBe(false)
  })
})
