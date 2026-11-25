// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  RetryResolveActions,
  RetryReviewConfirmDialog,
} from "@/features/social-posts/components/retry-resolve-actions"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

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

const click = (element: Element | null | undefined) => {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

const buttonWithText = (text: string): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll("button")).find(
    (button) => button.textContent === text,
  )

const render = (canResolve: boolean) => {
  const onRetry = vi.fn()
  act(() => {
    root.render(
      <RetryResolveActions
        busy={false}
        canResolve={canResolve}
        onResolve={vi.fn()}
        onRetry={onRetry}
      />,
    )
  })
  return onRetry
}

describe("RetryResolveActions", () => {
  test("a failed target retries in one click", () => {
    const onRetry = render(false)
    click(buttonWithText("composer.retryTarget"))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test("a target waiting for review asks before retrying: it may already be live", () => {
    const onRetry = render(true)
    click(buttonWithText("composer.retryTarget"))
    expect(onRetry).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(
      "composer.retryReviewDescription",
    )

    click(buttonWithText("composer.retryReviewConfirm"))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test("cancelling the confirmation never retries", () => {
    const onRetry = render(true)
    click(buttonWithText("composer.retryTarget"))
    click(buttonWithText("composer.removeCancel"))
    expect(onRetry).not.toHaveBeenCalled()
  })
})

describe("RetryReviewConfirmDialog", () => {
  test("confirming retries once and closes; nothing happens before", () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    act(() => {
      root.render(
        <RetryReviewConfirmDialog
          busy={false}
          onConfirm={onConfirm}
          onOpenChange={onOpenChange}
          open
        />,
      )
    })
    expect(onConfirm).not.toHaveBeenCalled()

    click(buttonWithText("composer.retryReviewConfirm"))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
