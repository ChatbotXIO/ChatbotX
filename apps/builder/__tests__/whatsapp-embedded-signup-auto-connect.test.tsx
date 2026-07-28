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
  const { isConnecting } = useEmbeddedSignupAutoConnect({
    hasFailed,
    onSubmit,
    onRelayError,
  })

  return <output data-testid="is-connecting">{String(isConnecting)}</output>
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
      wabaId: "",
      phoneNumberId: "",
      signupSessionId: "",
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

  const isConnecting = () =>
    container.querySelector<HTMLElement>("[data-testid='is-connecting']")
      ?.textContent

  test("submits as soon as the broker relays a code", () => {
    render()
    expect(isConnecting()).toBe("false")
    expect(onSubmit).not.toHaveBeenCalled()

    relay(successPayload())

    // No delay to advance: the code is everything the exchange needs, so the
    // submit goes out on the same tick the value lands.
    expect(onSubmit).toHaveBeenCalledTimes(1)
    // Still connecting afterwards: the button must stay frozen while the action
    // is in flight rather than flashing back to the launch state.
    expect(isConnecting()).toBe("true")
  })

  test("submits once for one code, not on every re-render", () => {
    render()
    relay(successPayload())

    render()
    render()

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  test("ignores a payload from any origin other than the broker", () => {
    render()

    relay(successPayload(), FOREIGN_ORIGIN)

    expect(isConnecting()).toBe("false")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onRelayError).not.toHaveBeenCalled()
  })

  test("ignores an unrelated message from the broker origin", () => {
    render()

    relay({ type: "some-other-oauth-result", status: "success", code: "x" })

    expect(isConnecting()).toBe("false")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onRelayError).not.toHaveBeenCalled()
  })

  test("ignores a payload that is not an object", () => {
    render()

    relay("ping")
    relay(null)

    expect(isConnecting()).toBe("false")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onRelayError).not.toHaveBeenCalled()
  })

  test("reports a relay failure without submitting", () => {
    render()

    relay({ type: WA_OAUTH_RESULT, status: "error" })

    expect(onRelayError).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(isConnecting()).toBe("false")
  })

  test("treats a success payload with no code as a failure", () => {
    render()

    relay({ type: WA_OAUTH_RESULT, status: "success" })

    expect(onRelayError).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(isConnecting()).toBe("false")
  })

  test("returns to the launch state when the connect fails", () => {
    render()
    relay(successPayload())
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // A consumed code cannot be exchanged again, so failing must drop it.
    render(true)

    expect(isConnecting()).toBe("false")
  })

  test("re-arms for a second signup after a failure", () => {
    render()
    relay(successPayload())
    render(true)

    // `hasErrored` drops back to false while the next submit is executing, which
    // is what lets a second failure reset the flow again.
    render(false)
    relay(successPayload("AQD-second-code"))

    expect(isConnecting()).toBe("true")
    expect(onSubmit).toHaveBeenCalledTimes(2)
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
