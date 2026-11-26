import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  state: {
    activeConversationId: "c1" as string | null,
    messages: [] as Record<string, unknown>[],
  },
  translation: {
    effective: true,
    workspaceLanguage: "vi" as string | null,
  },
  visible: { value: true },
  request: vi.fn(),
}))

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof mocks.state) => unknown) =>
    selector(mocks.state),
}))
vi.mock("@/features/translation/hooks/use-conversation-translation", () => ({
  useConversationTranslation: () => mocks.translation,
}))
vi.mock("@/features/translation/hooks/use-page-visible", () => ({
  usePageVisible: () => mocks.visible.value,
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/features/translation/actions/request-messages.action", () => ({
  requestTranslationsAction: mocks.request,
}))

const { useRequestTranslations } = await import(
  "@/features/translation/hooks/use-request-translations"
)
const { useTranslationUiStore } = await import(
  "@/features/translation/store/translation-ui-store"
)

const Probe = (_props: { tick: number }) => {
  useRequestTranslations()
  return null
}

const NOW = new Date("2026-11-19T00:00:00.000Z")
const message = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  conversationId: "c1",
  messageType: "incoming",
  type: "message",
  contentType: "text",
  text: `Quiero cambiar ${id}`,
  deletedAt: null,
  createdAt: NOW,
  translation: undefined,
  ...overrides,
})

describe("useRequestTranslations", () => {
  let container: HTMLDivElement
  let root: Root
  let tick = 0

  const render = () => {
    tick += 1
    act(() => {
      root.render(<Probe tick={tick} />)
    })
  }
  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }
  const requestedIds = (call: number) =>
    (
      mocks.request.mock.calls[call]?.[2] as { messages: { id: string }[] }
    ).messages.map((m) => m.id)

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.state.activeConversationId = "c1"
    mocks.state.messages = []
    mocks.translation.effective = true
    mocks.translation.workspaceLanguage = "vi"
    mocks.visible.value = true
    mocks.request.mockImplementation(
      async (
        _w: string,
        _c: string,
        input: { messages: { id: string }[] },
      ) => ({
        data: { accepted: input.messages.map((m) => m.id), skipped: [] },
      }),
    )
    useTranslationUiStore.setState({ entries: {} })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    tick = 0
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  test("opening a conversation asks at once for its inbound messages, shows them as translating", async () => {
    mocks.state.messages = [message("m1"), message("m2")]

    render()
    await advance(0)

    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(mocks.request.mock.calls[0]?.slice(0, 2)).toEqual(["ws-1", "c1"])
    expect(requestedIds(0)).toEqual(["m1", "m2"])
    expect(Object.keys(useTranslationUiStore.getState().entries)).toEqual([
      "m1",
      "m2",
    ])
  })

  test("does nothing at all when translation is off", async () => {
    mocks.translation.effective = false
    mocks.state.messages = [message("m1")]

    render()
    await advance(5000)

    expect(mocks.request).not.toHaveBeenCalled()
    expect(useTranslationUiStore.getState().entries).toEqual({})
  })

  test("a hidden tab asks for nothing; when it shows again it does", async () => {
    mocks.visible.value = false
    mocks.state.messages = [message("m1")]

    render()
    await advance(5000)
    expect(mocks.request).not.toHaveBeenCalled()

    mocks.visible.value = true
    render()
    await advance(0)
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  test("never asks twice for the same message", async () => {
    mocks.state.messages = [message("m1")]

    render()
    await advance(0)
    render()
    await advance(5000)
    render()
    await advance(5000)

    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  test("messages arriving while the conversation is open are gathered for 1.5 s into one request", async () => {
    mocks.state.messages = [message("m1")]
    render()
    await advance(0)
    mocks.request.mockClear()

    mocks.state.messages = [message("m1"), message("m2")]
    render()
    await advance(1000)
    mocks.state.messages = [message("m1"), message("m2"), message("m3")]
    render()
    await advance(1400)
    expect(mocks.request).not.toHaveBeenCalled()
    await advance(200)

    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(requestedIds(0)).toEqual(["m2", "m3"])
  })

  test("35 messages are two requests of 20 and 15", async () => {
    mocks.state.messages = Array.from({ length: 35 }, (_, i) =>
      message(`m${i}`),
    )

    render()
    await advance(0)

    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(requestedIds(0)).toHaveLength(20)
    expect(requestedIds(1)).toHaveLength(15)
  })

  test("a message the customer edited is asked for again", async () => {
    mocks.state.messages = [message("m1")]
    render()
    await advance(0)
    mocks.request.mockClear()

    mocks.state.messages = [message("m1", { text: "Texto editado" })]
    render()
    await advance(1500)

    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(requestedIds(0)).toEqual(["m1"])
  })

  test("a changed workspace language asks again for translations made for the old one", async () => {
    const translated = {
      direction: "inbound",
      status: "translated",
      displayText: "x",
      sourceLanguage: "es",
      targetLanguage: "vi",
      failureCode: null,
    }
    mocks.state.messages = [message("m1", { translation: translated })]
    render()
    await advance(5000)
    expect(mocks.request).not.toHaveBeenCalled()

    mocks.translation.workspaceLanguage = "en"
    render()
    await advance(1500)

    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  test("what the server skips stops showing as translating at once", async () => {
    mocks.state.messages = [message("m1"), message("m2")]
    mocks.request.mockResolvedValue({
      data: {
        accepted: ["m1"],
        skipped: [{ id: "m2", reason: "noise" }],
      },
    })

    render()
    await advance(0)

    expect(Object.keys(useTranslationUiStore.getState().entries)).toEqual([
      "m1",
    ])
  })

  test("a message another agent already queued keeps waiting for its result", async () => {
    mocks.state.messages = [message("m1")]
    mocks.request.mockResolvedValue({
      data: { accepted: [], skipped: [{ id: "m1", reason: "inFlight" }] },
    })

    render()
    await advance(0)

    expect(Object.keys(useTranslationUiStore.getState().entries)).toEqual([
      "m1",
    ])
  })

  test("no answer after 30 s turns translating into still waiting", async () => {
    mocks.state.messages = [message("m1")]

    render()
    await advance(0)
    expect(useTranslationUiStore.getState().entries.m1?.state).toBe("pending")

    await advance(29_000)
    expect(useTranslationUiStore.getState().entries.m1?.state).toBe("pending")
    await advance(1500)
    expect(useTranslationUiStore.getState().entries.m1?.state).toBe("waiting")
  })

  test("a failed request clears the translating state instead of spinning forever", async () => {
    mocks.state.messages = [message("m1")]
    mocks.request.mockRejectedValue(new Error("network"))

    render()
    await advance(0)

    expect(useTranslationUiStore.getState().entries).toEqual({})
  })

  test("a message whose request failed is asked for again on the next change", async () => {
    mocks.state.messages = [message("m1")]
    mocks.request.mockRejectedValueOnce(new Error("network"))

    render()
    await advance(0)
    mocks.state.messages = [message("m1"), message("m2")]
    render()
    await advance(1500)

    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(requestedIds(1)).toEqual(["m1", "m2"])
  })

  test("a message skipped as unavailable is asked for again once the integration works", async () => {
    mocks.state.messages = [message("m1")]
    mocks.request.mockResolvedValueOnce({
      data: { accepted: [], skipped: [{ id: "m1", reason: "unavailable" }] },
    })

    render()
    await advance(0)
    mocks.state.messages = [message("m1"), message("m2")]
    render()
    await advance(1500)

    expect(requestedIds(1)).toEqual(["m1", "m2"])
  })

  test("a skip with nothing to fix (noise, already translated) is not asked for again", async () => {
    mocks.state.messages = [message("m1")]
    mocks.request.mockResolvedValueOnce({
      data: {
        accepted: [],
        skipped: [{ id: "m1", reason: "alreadyTranslated" }],
      },
    })

    render()
    await advance(0)
    mocks.state.messages = [message("m1"), message("m2")]
    render()
    await advance(1500)

    expect(requestedIds(1)).toEqual(["m2"])
  })

  test("ignores outbound messages, noise and other conversations", async () => {
    mocks.state.messages = [
      message("out", { messageType: "outgoing" }),
      message("noise", { text: "👍" }),
      message("other", { conversationId: "c2" }),
      message("real"),
    ]

    render()
    await advance(0)

    expect(requestedIds(0)).toEqual(["real"])
  })
})
