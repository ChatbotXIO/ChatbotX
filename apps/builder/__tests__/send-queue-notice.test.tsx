import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { SendQueueNotice } from "@/features/messages/components/send-queue-notice"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const render = (props: Parameters<typeof SendQueueNotice>[0]) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<SendQueueNotice {...props} />)
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

const buttonWithText = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll("button")).find((b) => b.textContent === text)

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

describe("SendQueueNotice", () => {
  test("after a failure it says how many are held and offers only Discard (the resend is on the failed message)", () => {
    const onDiscard = vi.fn()
    const onContinue = vi.fn()
    const el = render({
      heldCount: 3,
      reason: "failed",
      onContinue,
      onDiscard,
    })

    expect(el.getAttribute("role")).toBeNull()
    expect(el.querySelector('[role="alert"]')).not.toBeNull()
    expect(el.textContent).toContain("messages.sendQueue.failed:3")
    expect(buttonWithText(el, "messages.sendQueue.continue")).toBeUndefined()

    act(() => {
      buttonWithText(el, "messages.sendQueue.discard")?.click()
    })
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onContinue).not.toHaveBeenCalled()
  })

  test("after a lost answer it offers to send the rest or discard them", () => {
    const onDiscard = vi.fn()
    const onContinue = vi.fn()
    const el = render({
      heldCount: 2,
      reason: "unconfirmed",
      onContinue,
      onDiscard,
    })

    expect(el.textContent).toContain("messages.sendQueue.unconfirmed:2")

    act(() => {
      buttonWithText(el, "messages.sendQueue.continue")?.click()
    })
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
