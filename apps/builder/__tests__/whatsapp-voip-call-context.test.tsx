import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  useWhatsappVoipCallContext,
  WhatsappVoipCallProvider,
} from "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context"

const voipCallMock = {
  remoteAudioRef: { current: null },
  answer: vi.fn().mockResolvedValue(undefined),
  dismiss: vi.fn(),
  hangup: vi.fn().mockResolvedValue(undefined),
  toggleMute: vi.fn(),
  startOutbound: vi.fn().mockResolvedValue("dialing"),
}
const useWhatsappVoipCallSpy = vi.fn(() => voipCallMock)
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-whatsapp-voip-call",
  () => ({ useWhatsappVoipCall: () => useWhatsappVoipCallSpy() }),
)

function ContextConsumer() {
  const { answer, dismiss, hangup, toggleMute } = useWhatsappVoipCallContext()
  return (
    <div>
      <button onClick={() => answer()} type="button">
        answer
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

describe("WhatsappVoipCallProvider", () => {
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

  test("exposes the single hook instance's callbacks to consumers", () => {
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
    expect(voipCallMock.answer).toHaveBeenCalledTimes(1)
    click("dismiss")
    expect(voipCallMock.dismiss).toHaveBeenCalledTimes(1)
    click("hangup")
    expect(voipCallMock.hangup).toHaveBeenCalledTimes(1)
    click("toggleMute")
    expect(voipCallMock.toggleMute).toHaveBeenCalledTimes(1)
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
