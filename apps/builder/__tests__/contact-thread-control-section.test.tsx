import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ThreadControlView } from "@/features/conversations/utils/thread-control"
import messages from "../messages/en.json"

vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ name: "AhaChat" }),
}))

const { ContactThreadControlSection } = await import(
  "@/features/contacts/components/contact-thread-control-section"
)

const NOW = new Date("2026-09-29T12:00:00.000Z")
const FIVE_MINUTES_MS = 5 * 60 * 1000

const view = (
  overrides: Partial<ThreadControlView> = {},
): ThreadControlView => ({
  contactInboxId: "ci-1",
  state: "standby",
  ownerRole: "ai_agent",
  updatedAt: new Date(NOW.getTime() - FIVE_MINUTES_MS),
  canRelease: false,
  canPass: false,
  isLocked: true,
  idleAt: null,
  now: NOW,
  ...overrides,
})

describe("ContactThreadControlSection", () => {
  let container: HTMLDivElement
  let root: Root
  const onError = vi.fn()

  const render = (threadControl: ThreadControlView) =>
    act(() => {
      root.render(
        // No `now` on the provider, like the app's request config: the
        // component must pass its own clock or next-intl reports
        // ENVIRONMENT_FALLBACK.
        <NextIntlClientProvider
          locale="en"
          messages={messages}
          onError={onError}
          timeZone="UTC"
        >
          <ContactThreadControlSection threadControl={threadControl} />
        </NextIntlClientProvider>,
      )
    })

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    onError.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("shows the thread state, current owner and this app's role", () => {
    render(view())

    // Thread state badge reflects standby (not "Owned"), partner is the owner.
    expect(container.textContent).toContain("Standby")
    expect(container.textContent).toContain("Meta AI")
    // Brand-neutral role label and the standby role box.
    expect(container.textContent).toContain("Your role")
    expect(container.textContent).toContain("Standby — listening only")
    expect(onError).not.toHaveBeenCalled()
  })

  test("owned shows the owned badge, not standby", () => {
    render(view({ state: "owned", ownerRole: null, isLocked: false }))

    expect(container.textContent).toContain("Owned")
    expect(container.textContent).not.toContain("Standby")
    expect(onError).not.toHaveBeenCalled()
  })

  test("idle shows no owner and its hint", () => {
    render(view({ state: "idle", ownerRole: null, isLocked: false }))

    expect(container.textContent).toContain("Idle")
    expect(container.textContent).toContain("No owner")
    expect(container.textContent).toContain(
      "The next customer message decides who answers.",
    )
    expect(onError).not.toHaveBeenCalled()
  })
})
