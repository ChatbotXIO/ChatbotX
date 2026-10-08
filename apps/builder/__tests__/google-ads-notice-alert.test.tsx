// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { NoticeAlert } from "@/features/integration-google-ads/components/notice-alert"
import { click, type Mounted, mount } from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
})
afterEach(() => ui.unmount())

describe("NoticeAlert", () => {
  test.each([
    ["destructive", "text-destructive"],
    ["warning", "text-amber-600"],
  ] as const)("%s tone colors the alert, with a readable message and roomy padding", (tone, toneClass) => {
    ui.render(
      <NoticeAlert
        dismissLabel="Dismiss"
        onDismiss={vi.fn()}
        title="Title"
        tone={tone}
      >
        <p>Message</p>
      </NoticeAlert>,
    )
    const alert = ui.container.querySelector('[role="alert"]')
    expect(alert?.className).toContain(toneClass)
    expect(alert?.className).toContain("px-4")
    expect(alert?.className).toContain("py-4")
    expect(alert?.querySelector(":scope > svg")).not.toBeNull()
    expect(alert?.querySelector('[data-slot="alert-title"]')?.textContent).toBe(
      "Title",
    )
    const description = alert?.querySelector('[data-slot="alert-description"]')
    expect(description?.textContent).toBe("Message")
    expect(description?.className).toContain("text-foreground/80!")
  })

  test("default tone renders without a title", () => {
    ui.render(<NoticeAlert tone="default">Plain</NoticeAlert>)
    const alert = ui.container.querySelector('[role="alert"]')
    expect(alert?.querySelector('[data-slot="alert-title"]')).toBeNull()
    expect(alert?.textContent).toBe("Plain")
    expect(alert?.querySelector("button")).toBeNull()
  })

  test("the dismiss button is icon-only, labelled, and calls onDismiss", () => {
    const onDismiss = vi.fn()
    ui.render(
      <NoticeAlert
        dismissLabel="Dismiss"
        onDismiss={onDismiss}
        tone="destructive"
      >
        x
      </NoticeAlert>,
    )
    const close = ui.container.querySelector('[aria-label="Dismiss"]')
    expect(close?.textContent).toBe("")
    click(close)
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
