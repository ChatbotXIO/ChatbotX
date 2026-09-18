import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWhatsappVoipCallStore } from "@/features/integration-whatsapp/calling/voip/voip-call-store"
import {
  useWhatsappVoipCallContext,
  WhatsappVoipCallProvider,
} from "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const voipCallMock = {
  remoteAudioRef: { current: null },
  answer: vi.fn().mockResolvedValue(undefined),
  dismiss: vi.fn(),
  hangup: vi.fn().mockResolvedValue(undefined),
  toggleMute: vi.fn(),
  dismissEnded: vi.fn(),
  startOutbound: vi.fn().mockResolvedValue("dialing"),
}
const useWhatsappVoipCallSpy = vi.fn(() => voipCallMock)
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-whatsapp-voip-call",
  () => ({ useWhatsappVoipCall: () => useWhatsappVoipCallSpy() }),
)

// P4 finding M5: `answer()`'s `onAnswered` callback is how a caller learns
// its OWN answer succeeded, whether immediately or (for a replacement)
// after `confirmReplacement` resolves — see `onAnsweredLog` below.
function ContextConsumerWithOnAnswered({
  onAnswered,
}: {
  onAnswered: (conversationId: string) => void
}) {
  const { answer } = useWhatsappVoipCallContext()
  return (
    <div>
      <button onClick={() => answer(undefined, onAnswered)} type="button">
        answer-with-callback
      </button>
      <button onClick={() => answer("ring-2", onAnswered)} type="button">
        answer-ring-2-with-callback
      </button>
    </div>
  )
}

function ContextConsumer() {
  const { answer, dismiss, hangup, toggleMute } = useWhatsappVoipCallContext()
  return (
    <div>
      <button onClick={() => answer()} type="button">
        answer
      </button>
      <button onClick={() => answer("ring-2")} type="button">
        answer-ring-2
      </button>
      <button onClick={() => dismiss()} type="button">
        dismiss
      </button>
      <button onClick={() => hangup()} type="button">
        hangup
      </button>
      <button onClick={() => toggleMute()} type="button">
        toggleMute
      </button>
    </div>
  )
}

const engagedCall = {
  transport: "voip" as const,
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  direction: "inbound" as const,
  phase: "active" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  deadlineAt: new Date().toISOString(),
  isMuted: false,
  isRecording: false,
}

const ringingEntry = {
  whatsappCallId: "ring-2",
  wacid: "wacid-2",
  conversationId: "conversation-2",
  contactInboxId: "contact-inbox-2",
  contactName: "Grace Hopper",
  offer: { sdpType: "offer" as const, sdp: "v=0" },
  deadlineAt: new Date(Date.now() + 30_000).toISOString(),
}

describe("WhatsappVoipCallProvider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    voipCallMock.answer.mockResolvedValue(undefined)
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("calls useWhatsappVoipCall exactly once, even with multiple consumers", () => {
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })

    expect(useWhatsappVoipCallSpy).toHaveBeenCalledTimes(1)
    // Exactly one `<audio>` element — the single remote-media sink shared by
    // every consumer, never one per consumer.
    expect(container.querySelectorAll("audio")).toHaveLength(1)
  })

  test("answer() with no replacement needed (slot's own call) goes straight to the underlying hook", () => {
    useWhatsappVoipCallStore.setState({
      call: { ...engagedCall, phase: "incomingRinging" },
    })
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })

    const click = (label: string) => {
      const button = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === label,
      )
      act(() => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
    }

    click("answer")
    expect(voipCallMock.answer).toHaveBeenCalledWith("call-1")
    // No confirmation dialog — nothing to replace.
    expect(container.textContent).not.toContain(
      "whatsapp.calls.replaceConfirm.title",
    )
  })

  test("answer(id) while the slot is free goes straight through with no confirmation", () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringingEntry] })
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "answer-ring-2",
    )
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(voipCallMock.answer).toHaveBeenCalledWith("ring-2")
  })

  test("answer(id) for a DIFFERENT call while the slot is engaged opens the replacement confirmation instead of answering immediately", () => {
    useWhatsappVoipCallStore.setState({
      call: engagedCall,
      ringingCalls: [ringingEntry],
    })
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "answer-ring-2",
    )
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    // Not answered yet — waiting on confirmation. The dialog portals
    // outside `container`, so assert against the document body.
    expect(voipCallMock.answer).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(
      "whatsapp.calls.replaceConfirm.title",
    )
    expect(document.body.textContent).toContain(
      JSON.stringify({ current: "Ada Lovelace", incoming: "Grace Hopper" }),
    )
  })

  // A confirmation that can only confirm into a no-op is worse than none:
  // the hook's `answeringIdRef` mutex is already held for the slot's own
  // in-flight answer, so a confirmed replacement would be silently rejected
  // and the dialog would close with no feedback at all.
  test("answer(id) offers NO replacement dialog while the slot's own call is still answering", () => {
    useWhatsappVoipCallStore.setState({
      call: { ...engagedCall, phase: "answering" as const },
      ringingCalls: [ringingEntry],
    })
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "answer-ring-2",
    )
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(voipCallMock.answer).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(
      "whatsapp.calls.replaceConfirm.title",
    )
  })

  test("confirming the replacement dialog answers the incoming call", () => {
    useWhatsappVoipCallStore.setState({
      call: engagedCall,
      ringingCalls: [ringingEntry],
    })
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })
    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((b) => b.textContent === "answer-ring-2")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const confirmButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "whatsapp.calls.replaceConfirm.confirm",
    )
    act(() => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(voipCallMock.answer).toHaveBeenCalledWith("ring-2")
  })

  test("cancelling the replacement dialog never answers anything", () => {
    useWhatsappVoipCallStore.setState({
      call: engagedCall,
      ringingCalls: [ringingEntry],
    })
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })
    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((b) => b.textContent === "answer-ring-2")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const cancelButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "whatsapp.calls.replaceConfirm.cancel",
    )
    act(() => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(voipCallMock.answer).not.toHaveBeenCalled()
  })

  test("exposes the single hook instance's dismiss/hangup/toggleMute callbacks to consumers", () => {
    act(() => {
      root.render(
        <WhatsappVoipCallProvider>
          <ContextConsumer />
        </WhatsappVoipCallProvider>,
      )
    })

    const click = (label: string) => {
      const button = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === label,
      )
      act(() => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
    }

    click("dismiss")
    expect(voipCallMock.dismiss).toHaveBeenCalledTimes(1)
    click("hangup")
    expect(voipCallMock.hangup).toHaveBeenCalledTimes(1)
    click("toggleMute")
    expect(voipCallMock.toggleMute).toHaveBeenCalledTimes(1)
  })

  // M5: `answer()`'s result/`onAnswered` continuation must fire for BOTH
  // the immediate-answer path and the delayed replace-confirm path — the
  // panel's D6 navigation (and any future caller) reuses this instead of
  // re-deriving "did it succeed" from the store itself.
  describe("onAnswered continuation (M5)", () => {
    test("answer success invokes onAnswered with the conversationId", async () => {
      useWhatsappVoipCallStore.setState({
        call: { ...engagedCall, phase: "incomingRinging" },
      })
      voipCallMock.answer.mockImplementation(() => {
        useWhatsappVoipCallStore.setState({ call: engagedCall })
        return Promise.resolve()
      })
      const onAnswered = vi.fn()
      act(() => {
        root.render(
          <WhatsappVoipCallProvider>
            <ContextConsumerWithOnAnswered onAnswered={onAnswered} />
          </WhatsappVoipCallProvider>,
        )
      })

      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((b) => b.textContent === "answer-with-callback")
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        await Promise.resolve()
      })

      expect(onAnswered).toHaveBeenCalledWith("conversation-1")
    })

    test("answer failure (call never becomes active) does not invoke onAnswered", () => {
      useWhatsappVoipCallStore.setState({
        call: { ...engagedCall, phase: "incomingRinging" },
      })
      // Left as-is — mic denied / lost race / rejected: the store never
      // reflects an activated call for this conversation.
      voipCallMock.answer.mockResolvedValue(undefined)
      const onAnswered = vi.fn()
      act(() => {
        root.render(
          <WhatsappVoipCallProvider>
            <ContextConsumerWithOnAnswered onAnswered={onAnswered} />
          </WhatsappVoipCallProvider>,
        )
      })

      act(() => {
        Array.from(container.querySelectorAll("button"))
          .find((b) => b.textContent === "answer-with-callback")
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })

      expect(onAnswered).not.toHaveBeenCalled()
    })

    test("answer → replace-confirm → confirming invokes onAnswered with the incoming call's conversationId", async () => {
      useWhatsappVoipCallStore.setState({
        call: engagedCall,
        ringingCalls: [ringingEntry],
      })
      voipCallMock.answer.mockImplementation(() => {
        useWhatsappVoipCallStore.setState({
          call: { ...engagedCall, conversationId: "conversation-2" },
        })
        return Promise.resolve()
      })
      const onAnswered = vi.fn()
      act(() => {
        root.render(
          <WhatsappVoipCallProvider>
            <ContextConsumerWithOnAnswered onAnswered={onAnswered} />
          </WhatsappVoipCallProvider>,
        )
      })
      act(() => {
        Array.from(container.querySelectorAll("button"))
          .find((b) => b.textContent === "answer-ring-2-with-callback")
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      expect(onAnswered).not.toHaveBeenCalled()

      const confirmButton = Array.from(
        document.querySelectorAll("button"),
      ).find((b) => b.textContent === "whatsapp.calls.replaceConfirm.confirm")
      await act(async () => {
        confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        await Promise.resolve()
      })

      expect(voipCallMock.answer).toHaveBeenCalledWith("ring-2")
      expect(onAnswered).toHaveBeenCalledWith("conversation-2")
    })

    test("replace declined (cancel) never invokes onAnswered", () => {
      useWhatsappVoipCallStore.setState({
        call: engagedCall,
        ringingCalls: [ringingEntry],
      })
      const onAnswered = vi.fn()
      act(() => {
        root.render(
          <WhatsappVoipCallProvider>
            <ContextConsumerWithOnAnswered onAnswered={onAnswered} />
          </WhatsappVoipCallProvider>,
        )
      })
      act(() => {
        Array.from(container.querySelectorAll("button"))
          .find((b) => b.textContent === "answer-ring-2-with-callback")
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })

      const cancelButton = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent === "whatsapp.calls.replaceConfirm.cancel",
      )
      act(() => {
        cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })

      expect(voipCallMock.answer).not.toHaveBeenCalled()
      expect(onAnswered).not.toHaveBeenCalled()
    })
  })

  test("throws when consumed outside the provider", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    expect(() => {
      act(() => {
        root.render(<ContextConsumer />)
      })
    }).toThrow(
      "useWhatsappVoipCallContext must be used within a WhatsappVoipCallProvider",
    )
    errorSpy.mockRestore()
  })
})
