// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const { CreateTemplateDialog } = await import(
  "@/features/templates/components/create-template-dialog"
)

describe("CreateTemplateDialog", () => {
  let container: HTMLDivElement
  let root: Root

  const input = () =>
    document.body.querySelector<HTMLInputElement>("#new-template-name")
  const button = (label: string) =>
    Array.from(document.body.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    )
  const type = (value: string) =>
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(input(), value)
      input()?.dispatchEvent(new Event("input", { bubbles: true }))
    })
  const open = () =>
    act(() => {
      button("Create")?.click()
    })

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <CreateTemplateDialog workspaceId="ws-1" />
        </NextIntlClientProvider>,
      ),
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("asks for a name first, and Continue stays disabled until there is one", () => {
    open()

    expect(document.body.textContent).toContain("New template")
    expect(button("Continue")?.disabled).toBe(true)

    type("   ")
    expect(button("Continue")?.disabled).toBe(true)

    type("Welcome kit")
    expect(button("Continue")?.disabled).toBe(false)
  })

  test("Continue opens the full form with the trimmed name", () => {
    open()
    type("  Welcome kit & more  ")

    act(() => button("Continue")?.click())

    expect(router.push).toHaveBeenCalledWith(
      "/space/ws-1/templates/create?name=Welcome+kit+%26+more",
    )
  })

  test("Cancel leaves without navigating", () => {
    open()
    type("Welcome kit")
    act(() => button("Cancel")?.click())

    expect(router.push).not.toHaveBeenCalled()
  })
})
