// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CapiConnectionTab } from "@/features/meta-conversions/components/capi-connection-tab"

const mocks = vi.hoisted(() => ({ useCapiConnectResult: vi.fn() }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/hooks/use-capi-connect-result", () => ({
  useCapiConnectResult: mocks.useCapiConnectResult,
}))
// The child surfaces have their own tests; here only which one renders per state.
vi.mock("@/features/meta-conversions/components/capi-connect-card", () => ({
  CapiConnectCard: ({ connectSlot }: { connectSlot: React.ReactNode }) => (
    <div>
      connect-card
      {connectSlot}
    </div>
  ),
}))
vi.mock("@/features/meta-conversions/components/capi-connected-card", () => ({
  CapiConnectedCard: ({ datasetId }: { datasetId: string | null }) => (
    <div>connected-card:{datasetId}</div>
  ),
}))
vi.mock("@/features/meta-conversions/components/capi-test-event-card", () => ({
  CapiTestEventCard: ({ channel }: { channel: string }) => (
    <div>test-event-card:{channel}</div>
  ),
}))

type TabProps = Parameters<typeof CapiConnectionTab>[0]

const baseProps: TabProps = {
  channel: "messenger",
  connection: "notConnected",
  integration: { id: "int-1", datasetId: "ds-1", capiTestEventCode: null },
  disconnectAction: vi.fn() as unknown as TabProps["disconnectAction"],
  connectCustomAction: vi.fn() as unknown as TabProps["connectCustomAction"],
  connectSlot: <button type="button">connect-slot</button>,
}

describe("CapiConnectionTab", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render(overrides: Partial<TabProps> = {}) {
    act(() => {
      root.render(<CapiConnectionTab {...baseProps} {...overrides} />)
    })
  }

  test("offers Connect, and nothing to verify, when not connected", () => {
    render()

    expect(container.textContent).toContain("connect-card")
    expect(container.textContent).toContain("connect-slot")
    expect(container.textContent).toContain(
      "metaConversions.status.notConnected",
    )
    expect(container.textContent).not.toContain("connected-card")
    expect(container.textContent).not.toContain("test-event-card")
  })

  test("shows the connected card and the test-event card once connected", () => {
    render({ connection: "connected" })

    expect(container.textContent).toContain("connected-card:ds-1")
    expect(container.textContent).toContain("test-event-card:messenger")
    expect(container.textContent).toContain("metaConversions.status.ready")
    expect(container.textContent).not.toContain("connect-card")
  })

  test("never renders a permission state", () => {
    render({ connection: "connected" })
    render({ connection: "notConnected" })

    expect(container.textContent).not.toContain("missingPermission")
    expect(container.textContent).not.toContain("unverified")
  })

  test("replaces the whole body when the channel cannot use the Conversions API", () => {
    render({
      connection: "connected",
      unsupportedContent: <p>unsupported-content</p>,
    })

    expect(container.textContent).toContain("unsupported-content")
    expect(container.textContent).toContain(
      "metaConversions.status.unsupported",
    )
    expect(container.textContent).not.toContain("connected-card")
    expect(container.textContent).not.toContain("connect-card")
  })

  test("renders the channel footnote", () => {
    render({ footnote: <p>channel-footnote</p> })

    expect(container.textContent).toContain("channel-footnote")
  })

  test("reports the outcome of a returning OAuth connect", () => {
    render()

    expect(mocks.useCapiConnectResult).toHaveBeenCalled()
  })
})
