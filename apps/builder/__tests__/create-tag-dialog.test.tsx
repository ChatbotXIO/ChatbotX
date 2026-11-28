// @vitest-environment jsdom

import { TAG_PRESET_COLORS } from "@chatbotx.io/utils/color"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { color?: string }) =>
    values?.color ? `${key}:${values.color}` : key,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/tags/provider/tag-hook", () => ({
  useInvalidateTags: () => vi.fn(),
}))
vi.mock("@/features/tags/actions/create-tag-action", () => ({
  createTagAction: Object.assign(vi.fn(), { bind: () => vi.fn() }),
}))

const { CreateTagDialog } = await import("@/features/tags/create-tag-dialog")

describe("CreateTagDialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const open = async () => {
    await act(() => {
      root.render(<CreateTagDialog folderId={null} workspaceId="ws" />)
    })
    await act(() => {
      container.querySelector("button")?.click()
    })
  }

  test("preselects the first preset, has no remove button and a plain footer", async () => {
    await open()

    const first = document.body.querySelector(
      `button[aria-label="presetLabel:${TAG_PRESET_COLORS[0]}"]`,
    )
    expect(first?.getAttribute("aria-pressed")).toBe("true")
    const buttons = Array.from(document.body.querySelectorAll("button"))
    expect(buttons.some((b) => b.textContent === "remove")).toBe(false)

    const cancel = buttons.find((b) => b.textContent === "actions.cancel")
    expect(cancel?.parentElement?.className).not.toContain("border-t")
    expect(cancel?.parentElement?.className).toContain("justify-end")
    expect(cancel?.className).toContain("bg-[#EAECF0]")
    expect(cancel?.className).toContain("h-8")
    const confirm = buttons.find((b) => b.textContent === "actions.confirm")
    expect(confirm?.className).toContain("bg-[#105CE2]")
    const content = document.body.querySelector("[data-slot=dialog-content]")
    expect(content?.className).toContain("w-[500px]")
    expect(content?.className).toContain("rounded-2xl")
    expect(content?.className).toContain("p-0")
    const input = document.body.querySelector("input[name=name]")
    expect(input?.className).toContain("h-[34px]")
    expect(input?.className).toContain("border-[#D0D5DD]")
  })
})
