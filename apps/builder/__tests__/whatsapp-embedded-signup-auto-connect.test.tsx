import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest"
import { useEmbeddedSignupAutoConnect } from "@/features/integration-whatsapp/hooks/use-embedded-signup-auto-connect"
import { WA_OAUTH_RESULT } from "@/features/integration-whatsapp/libs/embedded-signup"
import type { ConnectWhatsappSchema } from "@/features/integration-whatsapp/schemas"

const BROKER_ORIGIN = "https://broker.test"
const FOREIGN_ORIGIN = "https://evil.test"
const DELAY_SECONDS = 3
const OAUTH_CODE = "AQD-relayed-code"

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => BROKER_ORIGIN,
}))

type ProbeProps = {
  hasFailed: boolean
  onSubmit: () => void
  onRelayError: () => void
}

/** Mirrors the hook's output into the DOM so assertions read one source. */
function Probe({ hasFailed, onSubmit, onRelayError }: ProbeProps) {
  const { isConnecting, secondsLeft } = useEmbeddedSignupAutoConnect({
    delaySeconds: DELAY_SECONDS,
    hasFailed,
    onSubmit,
    onRelayError,
  })

  return (
    <output>
      <span data-testid="is-connecting">{String(isConnecting)}</span>
      <span data-testid="seconds-left">{secondsLeft}</span>
    </output>
  )
}

/**
 * The hook reads and writes the connect form, so it needs the same provider the
 * component gives it. Only the fields the hook touches need defaults.
 */
function Harness({ children }: { children: ReactNode }) {
  const form = useForm<ConnectWhatsappSchema>({
    defaultValues: {
      connectExisting: false,
      transferPhoneNumber: false,
      manualConnect: false,
      marketingMessageLite: true,
      code: "",
    },
  })

  return <FormProvider {...form}>{children}</FormProvider>
}

describe("useEmbeddedSignupAutoConnect", () => {
  let container: HTMLDivElement
  let root: Root
  let onSubmit: Mock<() => void>
  let onRelayError: Mock<() => void>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    onSubmit = vi.fn<() => void>()
    onRelayError = vi.fn<() => void>()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  const render = (hasFailed = false) => {
    act(() => {
      root.render(
        <Harness>
          <Probe
            hasFailed={hasFailed}
            onRelayError={onRelayError}
            onSubmit={onSubmit}
          />
        </Harness>,
      )
    })
  }

  const relay = (data: unknown, origin = BROKER_ORIGIN) => {
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data, origin }))
    })
  }

  const successPayload = (code: string = OAUTH_CODE) => ({
    type: WA_OAUTH_RESULT,
    status: "success",
    code,
  })

  const read = (testId: string) =>
    container.querySelector<HTMLElement>(`[data-testid='${testId}']`)
      ?.textContent

  const isConnecting = () => read("is-connecting")
  const secondsLeft = () => read("seconds-left")

  test("submits itself once the countdown elapses", () => {
    render()
    expect(isConnecting()).toBe("false")

    relay(successPayload())
    expect(isConnecting()).toBe("true")
    expect(secondsLeft()).toBe("3")

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(secondsLeft()).toBe("2")
    expect(onSubmit).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(secondsLeft()).toBe("0")
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Still connecting after the deadline: the button must stay disabled while
    // the action is in flight rather than flashing back to the launch state.
    expect(isConnecting()).toBe("true")
  })

  test("ignores a payload from any origin other than the broker", () => {
    render()

    relay(successPayload(), FOREIGN_ORIGIN)

    expect(isConnecting()).toBe("false")
    expect(onRelayError).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(DELAY_SECONDS * 1000)
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test("ignores an unrelated message from the broker origin", () => {
    render()

    relay({ type: "some-other-oauth-result", status: "success", code: "x" })

    expect(isConnecting()).toBe("false")
    expect(onRelayError).not.toHaveBeenCalled()
  })

  test("ignores a payload that is not an object", () => {
    render()

    relay("ping")
    relay(null)

    expect(isConnecting()).toBe("false")
    expect(onRelayError).not.toHaveBeenCalled()
  })

  test("reports a relay failure without arming the countdown", () => {
    render()

    relay({ type: WA_OAUTH_RESULT, status: "error" })

    expect(onRelayError).toHaveBeenCalledTimes(1)
    expect(isConnecting()).toBe("false")

    act(() => {
      vi.advanceTimersByTime(DELAY_SECONDS * 1000)
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test("treats a success payload with no code as a failure", () => {
    render()

    relay({ type: WA_OAUTH_RESULT, status: "success" })

    expect(onRelayError).toHaveBeenCalledTimes(1)
    expect(isConnecting()).toBe("false")
  })

  test("returns to the launch state when the connect fails", () => {
    render()
    relay(successPayload())

    act(() => {
      vi.advanceTimersByTime(DELAY_SECONDS * 1000)
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // A consumed code cannot be exchanged again, so failing must drop it.
    render(true)

    expect(isConnecting()).toBe("false")
    expect(secondsLeft()).toBe("3")
  })

  test("re-arms for a second signup after a failure", () => {
    render()
    relay(successPayload())
    act(() => {
      vi.advanceTimersByTime(DELAY_SECONDS * 1000)
    })
    render(true)

    // `hasErrored` drops back to false while the next submit is executing, which
    // is what lets a second failure reset the flow again.
    render(false)
    relay(successPayload("AQD-second-code"))
    expect(isConnecting()).toBe("true")

    act(() => {
      vi.advanceTimersByTime(DELAY_SECONDS * 1000)
    })
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  test("does not submit after the section unmounts", () => {
    render()
    relay(successPayload())

    act(() => {
      root.unmount()
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  test("stops listening to the relay after unmount", () => {
    render()
    act(() => {
      root.unmount()
    })

    relay(successPayload())

    expect(onRelayError).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
