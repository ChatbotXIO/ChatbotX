// @vitest-environment jsdom

import { triggerActions } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { allActions } from "@/features/triggers/components/actions/schemas"
import {
  trackAdsLead,
  defaultFn as trackAdsLeadDefaultFn,
} from "@/features/triggers/components/actions/schemas/track-ads-lead"
import {
  trackAdsPurchase,
  defaultFn as trackAdsPurchaseDefaultFn,
} from "@/features/triggers/components/actions/schemas/track-ads-purchase"
import { updateTriggerSchema } from "@/features/triggers/schema/mutation"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/tags/provider/tag-hook", () => ({
  useTagSelectOptions: () => [],
}))

vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlowSelectOptions: () => [],
}))

// `ActionEditor` unconditionally imports every action's field component at
// module scope (its `switch` only decides which one gets RENDERED), and
// several of these pull in server actions that reach the DB client — fatal
// in a client-side test environment. None of these branches are exercised
// by the trackAdsLead/trackAdsPurchase cases under test, so they are
// stubbed to inert no-ops purely to keep the module graph client-safe.
vi.mock("@/features/contacts/components/add-custom-field-dialog", () => ({
  SetCustomField: () => null,
}))

vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: () => null,
}))

vi.mock("@/features/meta-conversions/components/capi-event-fields", () => ({
  CapiEventFields: () => null,
}))

vi.mock("@/features/triggers/components/actions/run-google-sheet", () => ({
  GoogleSheetAction: () => null,
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

// `ActionEditor` (`components/actions/editor.tsx`) is imported AFTER the
// mocks above so it picks up the mocked InputField/hooks.
const { ActionEditor } = await import(
  "@/features/triggers/components/actions/editor"
)

describe("trackAdsLead schema", () => {
  test("accepts its own default value", () => {
    expect(trackAdsLead.safeParse(trackAdsLeadDefaultFn()).success).toBe(true)
  })

  test("rejects a mismatched type literal", () => {
    expect(trackAdsLead.safeParse({ type: "trackAdsPurchase" }).success).toBe(
      false,
    )
  })

  test("rejects a missing type", () => {
    expect(trackAdsLead.safeParse({}).success).toBe(false)
  })
})

describe("trackAdsPurchase schema", () => {
  test("accepts its own default value (no value/currency configured)", () => {
    expect(
      trackAdsPurchase.safeParse(trackAdsPurchaseDefaultFn()).success,
    ).toBe(true)
  })

  test("accepts a valid static value and currency", () => {
    const result = trackAdsPurchase.safeParse({
      type: "trackAdsPurchase",
      value: "19.99",
      currency: "usd",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // Currency is normalized to uppercase (same schema as sendMetaCapiEvent).
      expect(result.data.currency).toBe("USD")
      expect(result.data.value).toBe("19.99")
    }
  })

  test("treats blank value/currency strings as unset", () => {
    const result = trackAdsPurchase.safeParse({
      type: "trackAdsPurchase",
      value: "",
      currency: "",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.value).toBeUndefined()
      expect(result.data.currency).toBeUndefined()
    }
  })

  test("rejects a non-numeric value", () => {
    expect(
      trackAdsPurchase.safeParse({ type: "trackAdsPurchase", value: "abc" })
        .success,
    ).toBe(false)
  })

  test("rejects a currency that is not a 3-letter code", () => {
    expect(
      trackAdsPurchase.safeParse({ type: "trackAdsPurchase", currency: "US" })
        .success,
    ).toBe(false)
  })

  test("rejects a mismatched type literal", () => {
    expect(trackAdsPurchase.safeParse({ type: "trackAdsLead" }).success).toBe(
      false,
    )
  })
})

describe("allActions registry", () => {
  test("registers trackAdsLead and trackAdsPurchase", () => {
    expect(allActions.trackAdsLead).toBe(trackAdsLead)
    expect(allActions.trackAdsPurchase).toBe(trackAdsPurchase)
  })
})

describe("updateTriggerSchema persistence union", () => {
  test("persists a trigger with BOTH a trackAdsLead and a trackAdsPurchase action", () => {
    const result = updateTriggerSchema.safeParse({
      conditions: [],
      actions: [
        { type: "trackAdsLead" },
        { type: "trackAdsPurchase", value: "5.00", currency: "USD" },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.actions).toHaveLength(2)
      expect(result.data.actions[0]).toMatchObject({ type: "trackAdsLead" })
      expect(result.data.actions[1]).toMatchObject({
        type: "trackAdsPurchase",
        value: "5.00",
        currency: "USD",
      })
    }
  })

  test("rejects an unknown action type", () => {
    const result = updateTriggerSchema.safeParse({
      conditions: [],
      actions: [{ type: "notARealAction" }],
    })

    expect(result.success).toBe(false)
  })
})

// Fix 1: the picker (`add-action.tsx` ~L92) wires
// `value: triggerActions.enum.trackAdsLead|trackAdsPurchase` to the SAME
// `defaultFn` exports asserted above, and stores the resulting action keyed
// by that value in `allActions`. This ties the two together explicitly —
// the exact `{ value, defaultFn }` pairing add-action.tsx builds must
// satisfy the schema `allActions` looks up by that same value — instead of
// relying on the schema-level tests above to happen to cover it via shared
// imports.
describe("add-action picker wiring (trackAdsLead / trackAdsPurchase)", () => {
  test("trackAdsLead picker entry: allActions[value].safeParse(defaultFn()) succeeds", () => {
    const value = triggerActions.enum.trackAdsLead
    const result = allActions[value].safeParse(trackAdsLeadDefaultFn())

    expect(result.success).toBe(true)
  })

  test("trackAdsPurchase picker entry: allActions[value].safeParse(defaultFn()) succeeds", () => {
    const value = triggerActions.enum.trackAdsPurchase
    const result = allActions[value].safeParse(trackAdsPurchaseDefaultFn())

    expect(result.success).toBe(true)
  })
})

// Fix 2: `components/actions/editor.tsx`'s `ActionEditor` renders
// `TrackAdsPurchaseFields` (value + currency inputs) for `trackAdsPurchase`
// and renders nothing for `trackAdsLead` (no config beyond the discriminant
// — see track-ads-lead.ts).
describe("ActionEditor trackAdsLead / trackAdsPurchase", () => {
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

  function Wrapper({ type }: { type: string }) {
    const form = useForm({ defaultValues: {} })
    return (
      <FormProvider {...form}>
        <ActionEditor parentName="actions.0" type={type as never} />
      </FormProvider>
    )
  }

  test("renders TrackAdsPurchaseFields (value + currency inputs) for trackAdsPurchase", async () => {
    await act(async () => {
      root.render(<Wrapper type={triggerActions.enum.trackAdsPurchase} />)
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-testid="input-actions.0.value"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-testid="input-actions.0.currency"]'),
    ).not.toBeNull()
  })

  test("renders nothing for trackAdsLead (no config beyond the discriminant)", async () => {
    await act(async () => {
      root.render(<Wrapper type={triggerActions.enum.trackAdsLead} />)
      await Promise.resolve()
    })

    expect(container.innerHTML).toBe("")
  })
})
