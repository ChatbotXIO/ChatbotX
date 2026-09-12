// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { simpleUserInstances, getSoftphoneCredentialsActionMock } = vi.hoisted(
  () => ({
    simpleUserInstances: [] as FakeSimpleUser[],
    getSoftphoneCredentialsActionMock: vi.fn(),
  }),
)

class FakeSimpleUser {
  server: string
  options: Record<string, unknown>
  connect = vi.fn().mockResolvedValue(undefined)
  register = vi.fn().mockResolvedValue(undefined)
  disconnect = vi.fn().mockResolvedValue(undefined)
  call = vi.fn().mockResolvedValue(undefined)
  answer = vi.fn().mockResolvedValue(undefined)
  decline = vi.fn().mockResolvedValue(undefined)
  hangup = vi.fn().mockResolvedValue(undefined)
  mute = vi.fn()
  unmute = vi.fn()
  session = {
    incomingInviteRequest: {
      message: {
        getHeader: (name: string) =>
          name === "X-CBX-Root-UUID" ? "root-123" : undefined,
      },
    },
  }

  constructor(server: string, options: Record<string, unknown>) {
    this.server = server
    this.options = options
    simpleUserInstances.push(this)
  }
}

vi.mock("sip.js/lib/platform/web/index.js", () => ({
  SimpleUser: FakeSimpleUser,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

vi.mock(
  "../src/features/integration-whatsapp/calling/actions/softphone-credentials.action",
  () => ({
    getSoftphoneCredentialsAction: getSoftphoneCredentialsActionMock,
  }),
)

const { useSipUser } = await import(
  "../src/features/integration-whatsapp/calling/softphone/use-sip-user"
)

type SipUserHandle = ReturnType<typeof useSipUser>

/** Test harness: mounts the hook and exposes its return value via a ref-like box. */
function TestHarness({
  box,
  handlers,
}: {
  box: { current: SipUserHandle | null }
  handlers?: Parameters<typeof useSipUser>[0]
}) {
  box.current = useSipUser(handlers)
  return null
}

describe("useSipUser", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    simpleUserInstances.length = 0
    getSoftphoneCredentialsActionMock.mockReset()
    getSoftphoneCredentialsActionMock.mockResolvedValue({
      data: {
        sipUsername: "ag-workspace-1-user-1",
        password: "secret",
        sipDomain: "sip.example.com",
        wssUrl: "wss://sip.example.com",
        turn: {
          urls: "turn:sip.example.com",
          username: "u",
          credential: "c",
        },
      },
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

  const mount = async (
    handlers?: Parameters<typeof useSipUser>[0],
  ): Promise<{ current: SipUserHandle | null }> => {
    const box: { current: SipUserHandle | null } = { current: null }
    await act(() => {
      root.render(createElement(TestHarness, { box, handlers }))
    })
    return box
  }

  test("registers exactly one SimpleUser per open workspace", async () => {
    await mount()
    expect(simpleUserInstances).toHaveLength(1)
    const instance = simpleUserInstances[0]
    expect(instance.connect).toHaveBeenCalledOnce()
    expect(instance.register).toHaveBeenCalledOnce()
    expect(instance.server).toBe("wss://sip.example.com")
  })

  test("extracts the X-CBX-Root-UUID header on an incoming call", async () => {
    const onCallReceived = vi.fn()
    await mount({ onCallReceived })
    const instance = simpleUserInstances[0]
    const delegate = instance.options.delegate as {
      onCallReceived: () => void
    }
    delegate.onCallReceived()
    expect(onCallReceived).toHaveBeenCalledWith({ rootUuid: "root-123" })
  })

  test("passes the workspace's TURN credential as an ICE server", async () => {
    await mount()
    const instance = simpleUserInstances[0]
    const userAgentOptions = instance.options.userAgentOptions as {
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: { iceServers: { urls: string }[] }
      }
    }
    expect(
      userAgentOptions.sessionDescriptionHandlerFactoryOptions
        .peerConnectionConfiguration.iceServers[0].urls,
    ).toBe("turn:sip.example.com")
  })

  test("disconnects on unmount", async () => {
    await mount()
    const instance = simpleUserInstances[0]
    await act(async () => root.unmount())
    expect(instance.disconnect).toHaveBeenCalledOnce()
  })
})
