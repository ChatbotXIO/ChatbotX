import {
  type BroadcastPlanPolicy,
  type ChannelType,
  TRIAL_BROADCAST_PLAN_POLICY,
  UNRESTRICTED_BROADCAST_PLAN_POLICY,
} from "@chatbotx.io/database/partials"
import { zodResolver } from "@hookform/resolvers/zod"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { BroadcastSendLimitFields } from "@/features/broadcasts/components/broadcast-send-limit-fields"
import {
  type CreateBroadcastRequest,
  createBroadcastRequest,
} from "@/features/broadcasts/schema/action"

/** Echoes the key (and params) back so assertions never depend on copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

// A payload that satisfies every OTHER `createBroadcastRequest` refine (flow
// XOR template, schedule, targets, …) so `mode: "onChange"` validation only
// ever turns on/off because of the audience-range refine under test.
const VALID_BASE_VALUES: CreateBroadcastRequest = {
  channel: "telegram",
  flowId: "1",
  subaction: "allContacts",
  schedulesType: "now",
  schedulesAt: null,
  contactFilter: { operator: "and", conditions: [] },
}

function TestForm({
  channel = "telegram",
  planPolicy = UNRESTRICTED_BROADCAST_PLAN_POLICY,
}: {
  channel?: ChannelType
  planPolicy?: BroadcastPlanPolicy
}) {
  const form = useForm({
    resolver: zodResolver(createBroadcastRequest),
    mode: "onChange",
    defaultValues: { ...VALID_BASE_VALUES, channel },
  })
  return (
    <FormProvider {...form}>
      <BroadcastSendLimitFields planPolicy={planPolicy} />
    </FormProvider>
  )
}

/**
 * Sets a controlled `<input>`'s value the way a real keystroke would —
 * through the native value setter (bypassing React's value-tracker) plus a
 * native `input` event — so `react-number-format`'s own `onChange` wiring
 * (which the wrapped `NumberInput` relies on) fires exactly as it does for
 * genuine typing.
 */
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value",
)?.set

function typeIntoInput(input: HTMLInputElement, value: string): void {
  nativeInputValueSetter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

/** Lets the async resolver validation (and this component's `trigger()` effect) settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("BroadcastSendLimitFields", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("renders the three inputs with translated prefixes", () => {
    act(() => {
      root.render(<TestForm />)
    })

    const text = container.textContent ?? ""
    expect(text).toContain("broadcasts.sendLimit.rangeLabel")
    expect(text).toContain("broadcasts.sendLimit.fromLabel")
    expect(text).toContain("broadcasts.sendLimit.toLabel")
    expect(text).toContain("fields.sendRatePerMinute.label")

    const numberInputs = container.querySelectorAll(
      'input[inputmode="numeric"], input[type="text"]',
    )
    expect(numberInputs.length).toBeGreaterThanOrEqual(3)
  })

  test("shows the restricted policy rate for a governed channel", () => {
    act(() => {
      root.render(
        <TestForm
          channel="messenger"
          planPolicy={TRIAL_BROADCAST_PLAN_POLICY}
        />,
      )
    })

    const inputs = container.querySelectorAll<HTMLInputElement>("input")
    expect(inputs[2]?.placeholder).toBe("60")
  })

  test("shows the product default for unrestricted and non-governed channels", () => {
    act(() => {
      root.render(
        <TestForm
          channel="telegram"
          planPolicy={TRIAL_BROADCAST_PLAN_POLICY}
        />,
      )
    })
    expect(
      container.querySelectorAll<HTMLInputElement>("input")[2]?.placeholder,
    ).toBe("500")

    act(() => {
      root.render(
        <TestForm
          channel="messenger"
          planPolicy={UNRESTRICTED_BROADCAST_PLAN_POLICY}
        />,
      )
    })
    expect(
      container.querySelectorAll<HTMLInputElement>("input")[2]?.placeholder,
    ).toBe("500")
  })

  test("shows no cross-field error message by default", async () => {
    act(() => {
      root.render(<TestForm />)
    })
    await flush()

    expect(container.textContent ?? "").not.toContain(
      "broadcasts.sendLimit.rangeEndBeforeStart",
    )
  })

  test("shows the translated cross-field error once end < start, and clears it once fixed", async () => {
    act(() => {
      root.render(<TestForm />)
    })
    await flush()

    const inputs = Array.from(
      container.querySelectorAll<HTMLInputElement>("input"),
    )
    const [startInput, endInput] = inputs

    typeIntoInput(startInput, "10")
    await flush()
    typeIntoInput(endInput, "5")
    await flush()

    expect(container.textContent ?? "").toContain(
      "broadcasts.sendLimit.rangeEndBeforeStart",
    )
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    typeIntoInput(endInput, "20")
    await flush()

    expect(container.textContent ?? "").not.toContain(
      "broadcasts.sendLimit.rangeEndBeforeStart",
    )
  })
})
