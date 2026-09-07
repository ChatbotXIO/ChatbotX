import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  type ConnectFlowFinished,
  type UseConnectFlowResult,
  useConnectFlow,
} from "@/features/channel-connect/hooks/use-connect-flow"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { toastMock, setCoexistMock } = vi.hoisted(() => ({
  toastMock: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  setCoexistMock: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: toastMock }))
vi.mock("@/features/channel-connect/lib/coexist-client", () => ({
  setCoexist: setCoexistMock,
  coexistUnavailable: (t: (key: string) => string) => ({
    ok: false,
    text: t("coexist.errors.unknown"),
    reported: false,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

type Item = {
  id: string
  name: string
  coexist?: boolean
  aiReadsSyncedHistory?: boolean
}

const holder: { current: UseConnectFlowResult<Item> | null } = { current: null }
let container: HTMLDivElement | null = null
let root: Root | null = null

function getApi(): UseConnectFlowResult<Item> {
  if (!holder.current) {
    throw new Error("useConnectFlow probe has not rendered yet")
  }
  return holder.current
}

function Probe({
  channel,
  connectOne,
  onFinished,
  resolveCoexistWorkspaceId = () => "ws-1",
}: {
  channel: "messenger" | "instagram" | "whatsapp"
  connectOne: (item: Item) => Promise<ConnectActionResultWire>
  onFinished: (finished: ConnectFlowFinished<ConnectActionResultWire>) => void
  resolveCoexistWorkspaceId?: () => string | undefined
}) {
  const api = useConnectFlow<Item>({
    channel,
    connectOne,
    onFinished,
    resolveCoexistWorkspaceId,
  })
  useEffect(() => {
    holder.current = api
  })
  return null
}

function renderProbe(props: {
  channel: "messenger" | "instagram" | "whatsapp"
  connectOne: (item: Item) => Promise<ConnectActionResultWire>
  onFinished: (finished: ConnectFlowFinished<ConnectActionResultWire>) => void
  resolveCoexistWorkspaceId?: () => string | undefined
}) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<Probe {...props} />)
  })
}

beforeEach(() => {
  toastMock.warning.mockClear()
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  toastMock.info.mockClear()
  setCoexistMock.mockReset()
  setCoexistMock.mockResolvedValue({ ok: true })
})

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  holder.current = null
})

describe("useConnectFlow", () => {
  test("1 item runs inline (no dialog) and calls onFinished exactly once when not coexist-eligible", async () => {
    const onFinished = vi.fn()
    const result: ConnectActionResultWire = {
      kind: "outcome",
      outcome: {
        sourceId: "a",
        name: "A",
        status: "connected",
        coexistEligible: false,
      },
    }
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => result,
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledWith({ kind: "single", result })
  })

  test("1 connected item carrying a followUpFailed warning toasts before onFinished, prefixed by the account name", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "connected",
          warning: "followUpFailed",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(toastMock.warning).toHaveBeenCalledTimes(1)
    expect(toastMock.warning).toHaveBeenCalledWith(
      "A: channels.connectMany.reason.followUpFailed",
    )
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("1 connected item with no warning never toasts", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "connected",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(toastMock.warning).not.toHaveBeenCalled()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("a followUpFailed warning on a coexist row toasts before the coexist call runs", async () => {
    const onFinished = vi.fn()
    const result: ConnectActionResultWire = {
      kind: "outcome",
      outcome: {
        sourceId: "a",
        name: "Page A",
        status: "connected",
        warning: "followUpFailed",
        coexistEligible: true,
        integrationId: "int-1",
      },
    }
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => result,
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A", coexist: true }])
    })

    expect(toastMock.warning).toHaveBeenCalledTimes(1)
    expect(setCoexistMock).toHaveBeenCalledTimes(1)
    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).toHaveBeenCalledWith({ kind: "single", result })
  })

  test("1 item whose picker switch asked for coexist runs the coexist call, toasts success, then finishes", async () => {
    const onFinished = vi.fn()
    const result: ConnectActionResultWire = {
      kind: "outcome",
      outcome: {
        sourceId: "a",
        name: "Page A",
        status: "connected",
        coexistEligible: true,
        integrationId: "int-1",
      },
    }
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => result,
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([
        { id: "a", name: "A", aiReadsSyncedHistory: true, coexist: true },
      ])
    })

    expect(setCoexistMock).toHaveBeenCalledTimes(1)
    expect(setCoexistMock.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "int-1",
      enabled: true,
      aiReadsSyncedHistory: true,
    })
    expect(toastMock.success).toHaveBeenCalledWith("coexist.success.enabled")
    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledWith({ kind: "single", result })
  })

  test("a failed coexist call toasts the account name with its text exactly once, and still finishes", async () => {
    const onFinished = vi.fn()
    setCoexistMock.mockResolvedValue({
      ok: false,
      text: "Window expired",
      reported: false,
    })
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "connected",
          coexistEligible: true,
          integrationId: "int-1",
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A", coexist: true }])
    })

    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error).toHaveBeenCalledWith("Page A: Window expired")
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("a coexist failure the client already toasted is not announced a second time", async () => {
    const onFinished = vi.fn()
    setCoexistMock.mockResolvedValue({
      ok: false,
      text: "coexist.errors.unknown",
      // `clientErrorHandler` inside `setCoexist` already showed this one.
      reported: true,
    })
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "connected",
          coexistEligible: true,
          integrationId: "int-1",
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A", coexist: true }])
    })

    expect(toastMock.error).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("an unresolvable workspace surfaces as a coexist failure instead of a silent skip", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "connected",
          coexistEligible: true,
          integrationId: "int-1",
        },
      }),
    )
    renderProbe({
      channel: "messenger",
      connectOne,
      onFinished,
      resolveCoexistWorkspaceId: () => undefined,
    })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A", coexist: true }])
    })

    // No POST to an empty workspace path, but the operator is told.
    expect(setCoexistMock).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error).toHaveBeenCalledWith(
      "Page A: coexist.errors.unknown",
    )
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("a coexist-eligible item whose switch stayed off never calls the coexist route", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "connected",
          coexistEligible: true,
          integrationId: "int-1",
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(setCoexistMock).not.toHaveBeenCalled()
    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("1 connected item still finishes without a coexist call when coexistEligible is false", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "connected",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "whatsapp", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("1 duplicated item toasts the channel's duplicated key, stays idle, and never calls onFinished", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "duplicated",
          reason: "alreadyConnected",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(toastMock.error).toHaveBeenCalledWith(
      "Page A: channels.duplicated.messenger",
    )
    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).not.toHaveBeenCalled()
  })

  test("1 limitReached item toasts the reason key for its `reason`, stays idle, and never calls onFinished", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "limitReached",
          reason: "channelLimit",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(toastMock.error).toHaveBeenCalledWith(
      "Page A: channels.connectMany.reason.channelLimit",
    )
    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).not.toHaveBeenCalled()
  })

  test("1 failed/providerRejected item toasts the reason key, stays idle, and never calls onFinished", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "failed",
          reason: "providerRejected",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(toastMock.error).toHaveBeenCalledWith(
      "Page A: channels.connectMany.reason.providerRejected",
    )
    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).not.toHaveBeenCalled()
  })

  test("a provider-rejected item appends the provider's own sentence after the translated reason", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "failed",
          reason: "providerRejected",
          detail: "WhatsApp accounts cannot be used with this API.",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    // The reason leads, the provider's words follow — the same information
    // the batch row shows, in the surface a single connect actually has.
    expect(toastMock.error).toHaveBeenCalledWith(
      "Page A: channels.connectMany.reason.providerRejected — WhatsApp accounts cannot be used with this API.",
    )
    expect(onFinished).not.toHaveBeenCalled()
  })

  test("a single-item sessionError sets singleSessionError instead of calling onFinished", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "sessionError",
        code: "sessionExpired",
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(getApi().state).toEqual({
      kind: "singleSessionError",
      code: "sessionExpired",
    })
    expect(onFinished).not.toHaveBeenCalled()
  })

  test("2+ items open the batch state (dialog) instead of running inline", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn()
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ])
    })

    expect(connectOne).not.toHaveBeenCalled()
    expect(getApi().state).toEqual({
      kind: "batch",
      items: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
    })
    expect(onFinished).not.toHaveBeenCalled()

    act(() => {
      getApi().finishBatch()
    })
    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledWith({ kind: "batch" })
  })

  test("closeBatch returns to idle without calling onFinished", async () => {
    const onFinished = vi.fn()
    renderProbe({ channel: "messenger", connectOne: vi.fn(), onFinished })

    await act(async () => {
      await getApi().start([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ])
    })
    act(() => {
      getApi().closeBatch()
    })

    expect(getApi().state.kind).toBe("idle")
    expect(onFinished).not.toHaveBeenCalled()
  })

  test("never calls router.push itself — onFinished is the only completion signal", async () => {
    const push = vi.fn()
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ push }) }))
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "connected",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A" }])
    })

    expect(push).not.toHaveBeenCalled()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("start with zero items is a no-op", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn()
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([])
    })

    expect(connectOne).not.toHaveBeenCalled()
    expect(onFinished).not.toHaveBeenCalled()
    expect(getApi().state.kind).toBe("idle")
  })

  test("a row that asked for coexist but is not eligible says so once, and still finishes", async () => {
    const onFinished = vi.fn()
    const connectOne = vi.fn(
      async (): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "Page A",
          status: "connected",
          // The provider does not offer coexist for this account.
          coexistEligible: false,
          integrationId: "int-1",
        },
      }),
    )
    renderProbe({ channel: "messenger", connectOne, onFinished })

    await act(async () => {
      await getApi().start([{ id: "a", name: "A", coexist: true }])
    })

    expect(setCoexistMock).not.toHaveBeenCalled()
    expect(toastMock.info).toHaveBeenCalledTimes(1)
    expect(toastMock.info).toHaveBeenCalledWith("coexist.errors.notEligible")
    expect(onFinished).toHaveBeenCalledTimes(1)
  })
})
