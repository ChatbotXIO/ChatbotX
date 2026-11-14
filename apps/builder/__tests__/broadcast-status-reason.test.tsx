import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastStatusReason } from "@/features/broadcasts/components/broadcast-status-reason"

/** Echoes the key (and params) back so assertions never depend on English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const render = (
  broadcast: Parameters<typeof BroadcastStatusReason>[0]["broadcast"],
) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<BroadcastStatusReason broadcast={broadcast} />)
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

describe("BroadcastStatusReason", () => {
  test("renders nothing without a status reason", () => {
    const el = render({
      statusReason: null,
      statusErrorMessage: null,
      statusInbox: null,
    })
    expect(el.textContent).toBe("")
  })

  test("renders the reason, the page and the provider error as a tooltip", () => {
    const el = render({
      statusReason: "accountPolicyBlocked",
      statusErrorMessage: "(#2022) blocked",
      statusInbox: { id: "1", name: "Spring page" },
    })
    expect(el.textContent).toContain(
      "broadcasts.statusReason.accountPolicyBlocked",
    )
    expect(el.textContent).toContain("broadcasts.statusReason.page:Spring page")
    expect(el.querySelector("p")?.getAttribute("title")).toBe("(#2022) blocked")
  })

  test("drops the page line when the inbox was deleted", () => {
    const el = render({
      statusReason: "accountSendRestricted",
      statusErrorMessage: null,
      statusInbox: null,
    })
    expect(el.textContent).toContain(
      "broadcasts.statusReason.accountSendRestricted",
    )
    expect(el.textContent).not.toContain("broadcasts.statusReason.page")
  })
})
