import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  simpleUserInstances,
  getSoftphoneCredentialsActionMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  simpleUserInstances: [] as FakeSimpleUser[],
  getSoftphoneCredentialsActionMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

type Delegate = {
  onCallReceived: () => void
  onCallAnswered: () => void
  onCallHangup: () => void
}

class FakeSimpleUser {
  server: string
  options: { delegate: Delegate } & Record<string, unknown>
  connect = vi.fn().mockResolvedValue(undefined)
  register = vi.fn().mockResolvedValue(undefined)
  disconnect = vi.fn().mockResolvedValue(undefined)
  call = vi.fn().mockResolvedValue(undefined)
  answer = vi.fn().mockResolvedValue(undefined)
  decline = vi.fn().mockResolvedValue(undefined)
  hangup = vi.fn().mockResolvedValue(undefined)
  mute = vi.fn()
  unmute = vi.fn()
  /** Mutable per-test so a suite can simulate a missing root-uuid header. */
  session: {
    incomingInviteRequest: {
      message: { getHeader: (name: string) => string | undefined }
    }
  }

  constructor(server: string, options: Record<string, unknown>) {
    this.server = server
    this.options = options as { delegate: Delegate } & Record<string, unknown>
    this.session = {
      incomingInviteRequest: {
        message: {
          getHeader: (name: string) =>
            name === "X-CBX-Root-UUID" ? "root-123" : undefined,
        },
      },
    }
    simpleUserInstances.push(this)
  }
}

vi.mock("sip.js/lib/platform/web/index.js", () => ({
  SimpleUser: FakeSimpleUser,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

vi.mock("@/lib/log", () => ({
  logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock(
  "../src/features/integration-whatsapp/calling/actions/softphone-credentials.action",
  () => ({
    getSoftphoneCredentialsAction: getSoftphoneCredentialsActionMock,
  }),
)

const { SipUserProvider, useSipUserContext, useOptionalSipUserContext } =
  await import(
    "../src/features/integration-whatsapp/calling/softphone/sip-user-provider"
  )
const { useWhatsappCallStore } = await import(
  "../src/features/integration-whatsapp/calling/softphone/call-store"
)

type SipUserContextValue = ReturnType<typeof useSipUserContext>

const SYNTHETIC_KEY_PATTERN = /^unknown-\d+$/

/** Consumes the context so assertions can read/call it from the test body. */
function ContextConsumer({
  box,
}: {
  box: { current: SipUserContextValue | null }
}) {
  box.current = useSipUserContext()
  return null
}

/** A second, independent consumer — mirrors `StartCallButton` alongside the dock. */
function OptionalContextConsumer({
  box,
}: {
  box: { current: SipUserContextValue | null }
}) {
  box.current = useOptionalSipUserContext()
  return null
}

describe("SipUserProvider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    simpleUserInstances.length = 0
    getSoftphoneCredentialsActionMock.mockReset()
    loggerWarnMock.mockReset()
    getSoftphoneCredentialsActionMock.mockResolvedValue({
      data: {
        sipUsername: "ag-workspace-1-user-1",
        password: "secret",
        sipDomain: "sip.example.com",
        wssUrl: "wss://sip.example.com",
        turn: { urls: "turn:sip.example.com", username: "u", credential: "c" },
      },
    })
    useWhatsappCallStore.setState({
      incoming: {},
      active: null,
      outgoing: null,
    })
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    try {
      act(() => root.unmount())
    } catch {
      // Already unmounted by the test itself.
    }
    container.remove()
  })

  const mountWithTwoConsumers = async () => {
    const dockBox: { current: SipUserContextValue | null } = { current: null }
    const buttonBox: { current: SipUserContextValue | null } = { current: null }
    await act(() => {
      root.render(
        createElement(
          SipUserProvider,
          null,
          createElement(ContextConsumer, { box: dockBox }),
          createElement(OptionalContextConsumer, { box: buttonBox }),
        ),
      )
    })
    return { dockBox, buttonBox }
  }

  test("mounts exactly one SimpleUser even with two consumers (dock + start-call button)", async () => {
    await mountWithTwoConsumers()
    expect(simpleUserInstances).toHaveLength(1)
    expect(simpleUserInstances[0].connect).toHaveBeenCalledOnce()
    expect(simpleUserInstances[0].register).toHaveBeenCalledOnce()
  })

  test("an INVITE with a root-uuid header creates a ring, with no prior realtime event", async () => {
    await mountWithTwoConsumers()
    const delegate = simpleUserInstances[0].options.delegate
    act(() => {
      delegate.onCallReceived()
    })
    expect(useWhatsappCallStore.getState().incoming["root-123"]).toEqual({
      rootUuid: "root-123",
    })
  })

  test("realtime enrichment arriving before the INVITE merges onto the same key", async () => {
    useWhatsappCallStore.getState().enrichIncoming({
      rootUuid: "root-123",
      callId: "call-1",
      contactName: "Ada Lovelace",
    })
    await mountWithTwoConsumers()
    const delegate = simpleUserInstances[0].options.delegate
    act(() => {
      delegate.onCallReceived()
    })
    expect(useWhatsappCallStore.getState().incoming["root-123"]).toEqual({
      rootUuid: "root-123",
      callId: "call-1",
      contactName: "Ada Lovelace",
    })
  })

  test("a missing root-uuid header still surfaces a ring under a synthetic key and warns", async () => {
    await mountWithTwoConsumers()
    simpleUserInstances[0].session.incomingInviteRequest.message.getHeader =
      () => undefined
    const delegate = simpleUserInstances[0].options.delegate
    act(() => {
      delegate.onCallReceived()
    })
    const incoming = useWhatsappCallStore.getState().incoming
    const keys = Object.keys(incoming)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(SYNTHETIC_KEY_PATTERN)
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  test("answering activates the ring recorded by the caller's rootUuid", async () => {
    const { dockBox } = await mountWithTwoConsumers()
    const delegate = simpleUserInstances[0].options.delegate
    act(() => {
      delegate.onCallReceived()
    })
    await act(async () => {
      await dockBox.current?.answer("root-123")
    })
    act(() => {
      delegate.onCallAnswered()
    })
    expect(useWhatsappCallStore.getState().active?.rootUuid).toBe("root-123")
    expect(useWhatsappCallStore.getState().incoming["root-123"]).toBeUndefined()
  })

  test("hangup clears a synthetic-key ring that was never answered", async () => {
    await mountWithTwoConsumers()
    simpleUserInstances[0].session.incomingInviteRequest.message.getHeader =
      () => undefined
    const delegate = simpleUserInstances[0].options.delegate
    act(() => {
      delegate.onCallReceived()
    })
    expect(Object.keys(useWhatsappCallStore.getState().incoming)).toHaveLength(
      1,
    )
    act(() => {
      delegate.onCallHangup()
    })
    expect(useWhatsappCallStore.getState().incoming).toEqual({})
  })
})
