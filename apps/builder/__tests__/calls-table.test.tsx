import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappCallHistoryResource } from "@/features/whatsapp-calls/schema/resource"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
  }),
}))

vi.mock("@/features/messages/components/call-audio-player", () => ({
  CallAudioPlayer: ({ callId }: { callId: string }) => (
    <div data-call-id={callId} data-testid="call-audio-player" />
  ),
}))

vi.mock("@/features/messages/store/call-info-sheet-store", () => ({
  useCallInfoSheetStore: (selector: (state: { open: () => void }) => unknown) =>
    selector({ open: vi.fn() }),
}))

const { CallsTable } = await import(
  "../src/features/whatsapp-calls/calls-table"
)

const baseRow = (
  overrides: Partial<WhatsappCallHistoryResource> = {},
): WhatsappCallHistoryResource => ({
  id: "call-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  direction: "userInitiated",
  status: "completed",
  outcome: "completed",
  kind: "answeredInbound",
  durationSeconds: 30,
  recordingPath: null,
  conversationId: "conversation-1",
  contact: { id: "contact-1", fullName: "Jane", avatar: null },
  inbox: { id: "inbox-1", name: "Support" },
  answeredByUser: { id: "user-1", name: "Agent A" },
  initiatedByUser: null,
  ...overrides,
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (data: WhatsappCallHistoryResource[]) => {
  act(() => {
    root.render(<CallsTable data={data} workspaceId="ws-1" />)
  })
}

describe("CallsTable", () => {
  // M3/D9: the kind badge's label must be resolvable through the same
  // domain the in-conversation card uses — not a coincidentally-matching
  // second copy. `KIND_BADGE_CONFIG` in `calls-table.tsx` ties the four
  // terminal kinds' label to `WhatsappCallActivityLabelKey` at compile
  // time; here we assert the RENDERED key text for each kind so a
  // regression in that mapping is caught at runtime too.
  test.each([
    ["ongoing", "kindOngoing"],
    ["answeredInbound", "kindAnsweredInbound"],
    ["answeredOutbound", "kindAnsweredOutbound"],
    ["canceled", "canceledVoiceCall"],
    ["declined", "declinedVoiceCall"],
    ["missed", "missedVoiceCall"],
    ["unanswered", "unansweredVoiceCall"],
  ] as const)("renders the matching label key for kind=%s", (kind, expectedKeyFragment) => {
    render([baseRow({ kind })])
    expect(container.textContent).toContain(expectedKeyFragment)
  })

  test("renders no kind badge when kind is null", () => {
    render([baseRow({ kind: null })])
    // No badge text (any of the known kind keys) is present.
    expect(container.querySelector("[data-slot=badge]")).toBeNull()
  })

  test("shows the agent column populated from initiatedByUser for an outbound call", () => {
    render([
      baseRow({
        direction: "businessInitiated",
        initiatedByUser: { id: "user-2", name: "Agent B" },
        answeredByUser: null,
      }),
    ])
    expect(container.textContent).toContain("Agent B")
  })

  test("shows the agent column populated from answeredByUser for an inbound call", () => {
    render([
      baseRow({
        direction: "userInitiated",
        answeredByUser: { id: "user-1", name: "Agent A" },
      }),
    ])
    expect(container.textContent).toContain("Agent A")
  })

  test("shows an em dash for the agent column when no agent answered/initiated", () => {
    render([baseRow({ answeredByUser: null, initiatedByUser: null })])
    expect(container.textContent).toContain("—")
  })

  // M3: the recording player renders ONLY when the row actually has a
  // recording — never merely because the call completed.
  test("renders the recording player only when recordingPath is set", () => {
    render([baseRow({ recordingPath: "recordings/call-1.ogg" })])
    expect(
      container.querySelector('[data-testid="call-audio-player"]'),
    ).not.toBeNull()
  })

  test("does not render the recording player when recordingPath is null", () => {
    render([baseRow({ recordingPath: null })])
    expect(
      container.querySelector('[data-testid="call-audio-player"]'),
    ).toBeNull()
  })

  // L3: the info button's aria-label must describe the ACTION ("call
  // information"), not the page title ("Calls").
  test("the info button's aria-label is callInformation, not the page title", () => {
    render([baseRow()])
    const infoButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "callInformation",
    )
    expect(infoButton).toBeDefined()
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.getAttribute("aria-label") === "title",
      ),
    ).toBe(false)
  })

  test("the contact name links to that call's conversation in the inbox", () => {
    render([baseRow({ conversationId: "conversation-9" })])
    const contactLink = Array.from(container.querySelectorAll("a")).find(
      (anchor) => anchor.textContent?.includes("Jane"),
    )
    expect(contactLink?.getAttribute("href")).toBe(
      "/space/ws-1/inbox?conversationId=conversation-9",
    )
  })

  test("the contact link and the open-conversation button point at the same conversation", () => {
    render([baseRow({ conversationId: "conversation-9" })])
    const hrefs = Array.from(container.querySelectorAll("a")).map((anchor) =>
      anchor.getAttribute("href"),
    )
    expect(hrefs).toHaveLength(2)
    expect(new Set(hrefs).size).toBe(1)
  })

  test("falls back to the unknown-contact label and still links to the conversation", () => {
    render([
      baseRow({
        contact: { id: "contact-1", fullName: null, avatar: null },
        conversationId: "conversation-9",
      }),
    ])
    const contactLink = Array.from(container.querySelectorAll("a")).find(
      (anchor) => anchor.textContent?.includes("unknownContact"),
    )
    expect(contactLink?.getAttribute("href")).toBe(
      "/space/ws-1/inbox?conversationId=conversation-9",
    )
  })
})
