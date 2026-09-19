import { act, type ReactNode, StrictMode, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const providerMountMock = vi.fn()
vi.mock("@/features/realtime/workspace-realtime-provider", () => ({
  WorkspaceRealtimeProvider: ({ children }: { children: ReactNode }) => {
    useEffect(() => {
      providerMountMock()
    }, [])
    return <div data-testid="realtime-provider">{children}</div>
  },
}))

const voipProviderMountMock = vi.fn()
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    WhatsappVoipCallProvider: ({ children }: { children: ReactNode }) => {
      useEffect(() => {
        voipProviderMountMock()
      }, [])
      return <div data-testid="voip-call-provider">{children}</div>
    },
  }),
)

vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-call-panel",
  () => ({
    WhatsappCallPanel: () => <div data-testid="voip-call-panel" />,
  }),
)

const callRealtimeMountMock = vi.fn()
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-call-realtime",
  () => ({
    WhatsappCallRealtime: () => {
      useEffect(() => {
        callRealtimeMountMock()
      }, [])
      return <div data-testid="call-realtime" />
    },
  }),
)

vi.mock("@/features/messages/components/whatsapp-call-info-sheet", () => ({
  WhatsappCallInfoSheet: () => <div data-testid="call-info-sheet" />,
}))

const { WorkspaceRealtimeShell } = await import(
  "@/components/workspace-realtime-shell"
)

describe("WorkspaceRealtimeShell", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const find = (id: string) => container.querySelector(`[data-testid="${id}"]`)

  const render = (props: {
    realtimeEnabled: boolean
    callingEnabled: boolean
    callHistoryEnabled: boolean
    children?: ReactNode
  }) =>
    act(() => {
      root.render(
        <WorkspaceRealtimeShell {...props}>
          {props.children ?? <div data-testid="page-content" />}
        </WorkspaceRealtimeShell>,
      )
    })

  test("realtimeEnabled false renders bare children — no provider, no calling layer", async () => {
    await render({
      realtimeEnabled: false,
      callingEnabled: true,
      callHistoryEnabled: true,
    })

    expect(find("page-content")).not.toBeNull()
    expect(find("realtime-provider")).toBeNull()
    expect(find("voip-call-provider")).toBeNull()
    expect(find("call-realtime")).toBeNull()
    expect(find("call-info-sheet")).toBeNull()
  })

  test("callingEnabled false: realtime provider mounts, no VoIP provider/panel/call-realtime", async () => {
    await render({
      realtimeEnabled: true,
      callingEnabled: false,
      callHistoryEnabled: false,
    })

    expect(find("realtime-provider")).not.toBeNull()
    expect(find("page-content")).not.toBeNull()
    expect(find("voip-call-provider")).toBeNull()
    expect(find("voip-call-panel")).toBeNull()
    expect(find("call-realtime")).toBeNull()
  })

  test("callHistoryEnabled mounts the call info sheet independently of callingEnabled", async () => {
    await render({
      realtimeEnabled: true,
      callingEnabled: false,
      callHistoryEnabled: true,
    })

    expect(find("call-info-sheet")).not.toBeNull()
    expect(find("voip-call-provider")).toBeNull()
  })

  test("all gates true mounts everything", async () => {
    await render({
      realtimeEnabled: true,
      callingEnabled: true,
      callHistoryEnabled: true,
    })

    expect(find("realtime-provider")).not.toBeNull()
    expect(find("call-info-sheet")).not.toBeNull()
    expect(find("call-realtime")).not.toBeNull()
    expect(find("voip-call-provider")).not.toBeNull()
    expect(find("voip-call-panel")).not.toBeNull()
    expect(find("page-content")).not.toBeNull()
  })

  test("re-rendering with different children keeps a single provider mount — an active call survives route change", async () => {
    await render({
      realtimeEnabled: true,
      callingEnabled: true,
      callHistoryEnabled: true,
      children: <div data-testid="page-a" />,
    })
    expect(providerMountMock).toHaveBeenCalledTimes(1)
    expect(voipProviderMountMock).toHaveBeenCalledTimes(1)

    await render({
      realtimeEnabled: true,
      callingEnabled: true,
      callHistoryEnabled: true,
      children: <div data-testid="page-b" />,
    })

    expect(find("page-a")).toBeNull()
    expect(find("page-b")).not.toBeNull()
    // Neither the realtime provider nor the VoIP provider remounted for the
    // "navigation" — the single socket and the single peer connection they
    // own are never torn down just because the page under them changed.
    expect(providerMountMock).toHaveBeenCalledTimes(1)
    expect(voipProviderMountMock).toHaveBeenCalledTimes(1)
  })

  test("mounts cleanly under React Strict Mode's double-mount cycle, settling on exactly one of each provider in the tree", () => {
    expect(() => {
      act(() => {
        root.render(
          <StrictMode>
            <WorkspaceRealtimeShell
              callHistoryEnabled={true}
              callingEnabled={true}
              realtimeEnabled={true}
            >
              <div data-testid="page-content" />
            </WorkspaceRealtimeShell>
          </StrictMode>,
        )
      })
    }).not.toThrow()

    // Settling on exactly one of each element in the DOM (not two,
    // side-by-side) proves the double-mount cycle unwound the first
    // synthetic mount rather than leaving both live.
    expect(
      container.querySelectorAll('[data-testid="realtime-provider"]'),
    ).toHaveLength(1)
    expect(
      container.querySelectorAll('[data-testid="voip-call-provider"]'),
    ).toHaveLength(1)
    expect(callRealtimeMountMock.mock.calls.length).toBeGreaterThan(0)
  })
})
