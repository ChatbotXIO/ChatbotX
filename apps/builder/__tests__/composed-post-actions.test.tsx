// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  ACTION_BUTTON_CLASS,
  ACTION_ICON_CLASS,
  ComposedPostActions,
} from "@/features/social-posts/components/composed-post-actions"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) => (
    <a {...props}>{children as never}</a>
  ),
}))

let root: Root | undefined
let container: HTMLDivElement | undefined

const render = (
  overrides: Partial<Parameters<typeof ComposedPostActions>[0]> = {},
) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <ComposedPostActions
        busy={false}
        canDelete
        canRetry
        duplicating={false}
        editHref="/edit"
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onRetry={vi.fn()}
        readOnly={false}
        {...overrides}
      />,
    )
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("ComposedPostActions", () => {
  test("shows edit, duplicate, retry and delete as small icon buttons", () => {
    const view = render()
    const controls = Array.from(
      view.querySelectorAll("a, button"),
    ) as HTMLElement[]

    expect(controls.map((c) => c.getAttribute("aria-label"))).toEqual([
      "actions.edit",
      "actions.duplicate",
      "actions.retry",
      "actions.delete",
    ])
    for (const control of controls) {
      expect(control.className).toContain(ACTION_BUTTON_CLASS)
      expect(control.className).not.toContain("size-9")
      expect(control.querySelector("svg")?.getAttribute("class")).toContain(
        ACTION_ICON_CLASS,
      )
    }
  })

  test("hides retry and delete when they do not apply", () => {
    const view = render({ canDelete: false, canRetry: false })

    expect(view.querySelectorAll("a, button")).toHaveLength(2)
  })

  test("a read-only workspace disables the mutating buttons but not edit", () => {
    const view = render({ readOnly: true })
    const buttons = Array.from(view.querySelectorAll("button"))

    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(view.querySelector("a")).not.toBeNull()
  })
})
