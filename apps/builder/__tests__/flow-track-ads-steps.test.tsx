// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@chatbotx.io/ui/components/form/input-field", () => ({
  InputField: ({
    name,
    label,
    placeholder,
  }: {
    name: string
    label?: string
    placeholder?: string
  }) => {
    const form = useFormContext()

    return (
      <label>
        {label}
        <input
          data-testid={`input-${name}`}
          placeholder={placeholder}
          {...form.register(name)}
        />
      </label>
    )
  },
}))

// `editor.tsx` files are imported directly (NOT through the `steps/index.tsx`
// `allSteps` barrel, which eagerly imports every step's editor/viewer
// module — including several that pull in `"use server"` actions reaching
// the DB client, fatal in this client-side test environment) so they pick up
// the mocked InputField/next-intl above. The barrel's registration itself
// (`allSteps[stepTypes.enum.trackAdsLead] === trackAdsLeadStep`, etc.) is
// covered by the source-grep assertions in
// `src/features/flows/react-flow/steps/__tests__/track-ads-registration.test.ts`.
const { TrackAdsLeadEditor } = await import(
  "@/features/flows/react-flow/steps/track-ads-lead/editor"
)
const { TrackAdsPurchaseEditor } = await import(
  "@/features/flows/react-flow/steps/track-ads-purchase/editor"
)

describe("TrackAdsLeadEditor / TrackAdsPurchaseEditor rendering", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  function PurchaseWrapper() {
    const form = useForm({ defaultValues: {} })
    return (
      <FormProvider {...form}>
        <TrackAdsPurchaseEditor parentName="steps.0" />
      </FormProvider>
    )
  }

  test("TrackAdsPurchaseEditor renders value + currency inputs (reused CapiValueCurrencyFields)", async () => {
    await act(async () => {
      root.render(<PurchaseWrapper />)
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-testid="input-steps.0.value"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-testid="input-steps.0.currency"]'),
    ).not.toBeNull()
  })

  test("TrackAdsLeadEditor renders no config inputs (no config beyond the discriminant)", async () => {
    await act(async () => {
      root.render(<TrackAdsLeadEditor />)
      await Promise.resolve()
    })

    expect(container.querySelectorAll("input")).toHaveLength(0)
  })

  test("both editors surface the ads-attribution help note (Codex finding 6)", async () => {
    await act(async () => {
      root.render(<TrackAdsLeadEditor />)
      await Promise.resolve()
    })
    expect(container.textContent).toContain(
      "metaConversions.trackAdsFlowStep.helpNote",
    )

    await act(async () => {
      root.render(<PurchaseWrapper />)
      await Promise.resolve()
    })
    expect(container.textContent).toContain(
      "metaConversions.trackAdsFlowStep.helpNote",
    )
  })
})
