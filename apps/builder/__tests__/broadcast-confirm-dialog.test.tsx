import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastConfirmDialog } from "@/features/broadcasts/components/broadcast-confirm-dialog"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    type,
  }: {
    children: React.ReactNode
    disabled?: boolean
    type?: string
  }) => (
    <button disabled={disabled} type={type === "submit" ? "submit" : "button"}>
      {children}
    </button>
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const render = (props: {
  isValid: boolean
  countCapped?: boolean
  count?: number
}) => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <BroadcastConfirmDialog
        count={5}
        isReceiversCountLoading={false}
        isSubmitting={false}
        onOpenChange={() => undefined}
        onPreviewReceivers={() => undefined}
        open={true}
        {...props}
      />,
    )
  })
  return container as HTMLDivElement
}

const submitButton = (el: HTMLElement) =>
  el.querySelector('button[type="submit"]') as HTMLButtonElement

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
})

describe("BroadcastConfirmDialog submit gating", () => {
  test("disables submit when the form is invalid", () => {
    expect(submitButton(render({ isValid: false })).disabled).toBe(true)
  })

  test("enables submit when the form is valid and receivers are known", () => {
    expect(submitButton(render({ isValid: true })).disabled).toBe(false)
  })

  test("labels a capped count as a lower bound and keeps preview enabled", () => {
    const el = render({ isValid: true, count: 100_000, countCapped: true })
    const preview = el.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement
    expect(preview.textContent).toContain("broadcasts.receiversCountCapped")
    expect(preview.disabled).toBe(false)
  })

  test("never shows 0 for a capped window with no lower bound", () => {
    const el = render({ isValid: true, count: 0, countCapped: true })
    const preview = el.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement
    expect(preview.textContent).toContain("broadcasts.receiversCountUnknown")
    expect(preview.disabled).toBe(false)
    expect(submitButton(el).disabled).toBe(false)
  })
})
