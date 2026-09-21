import { broadcastChannelCapabilities } from "@chatbotx.io/database/partials"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { BroadcastSendLimitFields } from "@/features/broadcasts/components/broadcast-send-limit-fields"

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

function TestForm({
  defaultValues,
  withError,
}: {
  defaultValues?: Record<string, unknown>
  withError?: boolean
}) {
  const form = useForm({ defaultValues })
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (withError) {
      form.setError("audienceRange" as never, {
        message: "broadcastSendLimit.rangeEndBeforeStart",
      })
    }
  }, [withError])
  return (
    <FormProvider {...form}>
      <BroadcastSendLimitFields />
    </FormProvider>
  )
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
    expect(text).toContain("broadcasts.sendLimit.fromContact")
    expect(text).toContain("broadcasts.sendLimit.toContact")
    expect(text).toContain("fields.sendRatePerMinute.label")

    const numberInputs = container.querySelectorAll(
      'input[inputmode="numeric"], input[type="text"]',
    )
    expect(numberInputs.length).toBeGreaterThanOrEqual(3)
  })

  test("shows no cross-field error message by default", () => {
    act(() => {
      root.render(<TestForm />)
    })
    expect(container.textContent ?? "").not.toContain(
      "broadcastSendLimit.rangeEndBeforeStart",
    )
  })

  test("shows the translated cross-field error when errors.audienceRange is set", () => {
    act(() => {
      root.render(<TestForm withError={true} />)
    })
    expect(container.textContent ?? "").toContain(
      "broadcastSendLimit.rangeEndBeforeStart",
    )
    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
  })

  // The component reads no channel prop and the create form renders it
  // unconditionally inside the shared contact-filter card (see
  // create-broadcast-form.tsx), so its rendering is channel-invariant by
  // construction. This loop asserts that invariant holds for every
  // broadcast-capable channel rather than rendering the full
  // `CreateBroadcastForm` per channel (impractical in jsdom — see brief
  // §3.9 fallback).
  test.each(
    broadcastChannelCapabilities.map((c) => c.channel),
  )("renders all three inputs regardless of channel (%s)", (_channel) => {
    act(() => {
      root.render(<TestForm />)
    })
    const numberInputs = container.querySelectorAll(
      'input[inputmode="numeric"], input[type="text"]',
    )
    expect(numberInputs.length).toBeGreaterThanOrEqual(3)
    act(() => root.unmount())
    container.remove()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
})
