// @vitest-environment jsdom
import {
  googleAdsConversionFieldsSchema,
  withGoogleAdsConversionRefinements,
} from "@chatbotx.io/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  type DefaultValues,
  FormProvider,
  type UseFormReturn,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { z } from "zod"

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key
    t.has = (key: string) => key.startsWith("googleAds.")
    return t
  },
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    googleAdsAPI: {
      getIntegration: { queryOptions: (opts: unknown) => opts },
    },
  },
}))
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query() }))
vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest} />
  ),
}))
// The real field is covered by google-ads-template-field.test.tsx; here it is a
// plain input bound like it, with the real translated error message.
vi.mock(
  "@/features/integration-google-ads/components/google-ads-template-field",
  async () => {
    const { FormField, FormItem } = await import(
      "@chatbotx.io/ui/components/ui/form"
    )
    const { TranslatedFieldMessage } = await import(
      "@/features/integration-google-ads/components/translated-field-message"
    )
    return {
      GoogleAdsTemplateField: ({
        name,
        label,
        description,
        info,
      }: {
        name: string
        label: string
        description?: string
        info?: { label: string; content: ReactNode }
      }) => {
        const { control } = useFormContext()
        return (
          <FormField
            control={control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <span>{label}</span>
                <input
                  data-testid={`template-${name}`}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(event.target.value)}
                  value={field.value ?? ""}
                />
                {description ? <small>{description}</small> : null}
                {info ? (
                  <button aria-label={info.label} type="button">
                    <span data-testid={`info-${name}`}>{info.content}</span>
                  </button>
                ) : null}
                <TranslatedFieldMessage />
              </FormItem>
            )}
          />
        )
      },
    }
  },
)
vi.mock(
  "@/features/integration-google-ads/components/google-ads-customer-matching",
  () => ({
    GoogleAdsCustomerMatching: ({
      emailName,
      phoneName,
      isLegacyUpload,
    }: {
      emailName: string
      phoneName: string
      isLegacyUpload: boolean
    }) => (
      <div
        data-email-name={emailName}
        data-legacy={String(isLegacyUpload)}
        data-phone-name={phoneName}
        data-testid="customer-matching"
      />
    ),
  }),
)
vi.mock(
  "@/features/integration-google-ads/components/google-ads-select-field",
  () => ({
    GoogleAdsSelectField: ({
      name,
      options,
      description,
      onPick,
      ariaLabel,
    }: {
      name: string
      options: { value: string; label: string; disabled?: boolean }[]
      description?: string
      onPick?: (value: string) => void
      ariaLabel: string
    }) => {
      const { setValue, control } = useFormContext()
      const current: string | undefined = useWatch({ control, name })
      return (
        <>
          <select
            aria-label={ariaLabel}
            data-testid={`select-${name}`}
            onChange={(event) => {
              setValue(name, event.target.value)
              onPick?.(event.target.value)
            }}
            value={current ?? options[0]?.value}
          >
            {options.map((option) => (
              <option
                data-disabled={option.disabled ? "true" : "false"}
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
          {description ? (
            <small data-testid={`description-${name}`}>{description}</small>
          ) : null}
        </>
      )
    },
  }),
)

import { GoogleAdsConversionFields } from "@/features/integration-google-ads/components/google-ads-conversion-fields"

const connected = (overrides: Record<string, unknown> = {}) => ({
  connected: true,
  readiness: "ready",
  customerId: "1112223333",
  descriptiveName: "Acme",
  currencyCode: "USD",
  setupError: null,
  conversionActionsSyncedAt: new Date(),
  uploadMethod: "dataManager",
  consent: { status: "absent", adUserData: null, adPersonalization: null },
  conversionActions: [
    {
      id: "1",
      name: "Lead",
      category: "SIGNUP",
      status: "ENABLED",
      countingType: "ONE_PER_CLICK",
    },
    {
      id: "2",
      name: "Old",
      category: "SIGNUP",
      status: "PAUSED",
      countingType: "ONE_PER_CLICK",
    },
  ],
  ...overrides,
})

const schema = withGoogleAdsConversionRefinements(
  googleAdsConversionFieldsSchema,
)
type Values = z.input<typeof schema>
type Defaults = DefaultValues<Values>

let formRef: UseFormReturn<Values>

const Host = ({
  defaults,
  parentName,
}: {
  defaults: Defaults
  parentName: string
}) => {
  const form = useForm<Values>({
    mode: "onBlur",
    defaultValues: defaults,
    resolver: zodResolver(schema),
  })
  formRef = form
  return (
    <FormProvider {...form}>
      <GoogleAdsConversionFields parentName={parentName} />
    </FormProvider>
  )
}

// base-ui's Radio builds a PointerEvent on click, which jsdom does not ship.
if (!window.PointerEvent) {
  window.PointerEvent =
    class PointerEvent extends MouseEvent {} as typeof window.PointerEvent
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  mocks.query.mockReset()
  mocks.refetch.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const renderWith = (defaults: Defaults, parentName = "") => {
  act(() => {
    root.render(<Host defaults={defaults} parentName={parentName} />)
  })
}

const render = (selectedId = "") =>
  renderWith({ conversionActionId: selectedId })

const options = () =>
  Array.from(
    container.querySelectorAll<HTMLOptionElement>(
      '[data-testid="select-conversionActionId"] option',
    ),
  ).map((option) => ({
    value: option.value,
    disabled: option.dataset.disabled === "true",
  }))

describe("GoogleAdsConversionFields", () => {
  test("shows a skeleton while loading and still renders the template inputs", () => {
    mocks.query.mockReturnValue({ isPending: true, isError: false })
    render()

    expect(
      container.querySelector("[data-testid=google-ads-actions-loading]"),
    ).not.toBeNull()
    expect(container.querySelector("select")).toBeNull()
    expect(
      container.querySelector("[data-testid=template-value]"),
    ).not.toBeNull()
    expect(
      container.querySelector("[data-testid=template-currency]"),
    ).not.toBeNull()
    // The dedup choice waits for an action: its category sets the default.
    expect(
      container.querySelector('[data-testid="select-dedupMode"]'),
    ).toBeNull()
    expect(container.querySelector("[data-testid=template-dedupId]")).toBeNull()
  })

  test("shows an error state with a retry button", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: true,
      refetch: mocks.refetch,
    })
    render()

    expect(container.textContent).toContain(
      "googleAds.conversionFields.loadError",
    )
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.retry",
    )
    act(() => retry?.click())
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  test("links to the settings page when Google Ads is not connected", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        connected: false,
        conversionActions: [],
        uploadMethod: null,
        consent: {
          status: "absent",
          adUserData: null,
          adPersonalization: null,
        },
      },
    })
    render()

    expect(container.textContent).toContain(
      "googleAds.conversionFields.notConnected",
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/space/ws-1/settings/integrations/google-ads",
    )
    expect(container.querySelector("select")).toBeNull()
  })

  test("shows the empty state when connected without any actions", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected({ conversionActions: [] }),
    })
    render()

    expect(container.textContent).toContain(
      "googleAds.conversionFields.noActions",
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/space/ws-1/settings/integrations/google-ads",
    )
  })

  test("only ENABLED actions are selectable", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected(),
    })
    render("1")

    expect(options()).toEqual([
      { value: "1", disabled: false },
      { value: "2", disabled: true },
    ])
    expect(container.textContent).not.toContain("unavailableWarning")
  })

  test("keeps a selected id missing from the list visible with a warning", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected(),
    })
    render("99")

    expect(options()[0]).toEqual({ value: "99", disabled: true })
    expect(container.textContent).toContain(
      "googleAds.conversionFields.unavailableOption:99",
    )
    expect(container.textContent).toContain(
      "googleAds.conversionFields.unavailableWarning",
    )
  })

  test("warns when the selected action is no longer enabled", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected(),
    })
    render("2")

    expect(container.textContent).toContain(
      "googleAds.conversionFields.unavailableWarning",
    )
  })

  test("tells that gbraid cannot be sent to a ONE_PER_CLICK action", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected(),
    })
    render("1")

    expect(container.textContent).toContain(
      "googleAds.conversionActions.onePerClickNote",
    )
  })

  test("shows no gbraid note for a MANY_PER_CLICK action", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected({
        conversionActions: [
          {
            id: "3",
            name: "Every",
            category: "SIGNUP",
            status: "ENABLED",
            countingType: "MANY_PER_CLICK",
          },
        ],
      }),
    })
    render("3")

    expect(container.textContent).not.toContain("onePerClickNote")
  })

  test("lists an external-attribution action disabled and flags the stored choice", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected({
        conversionActions: [
          {
            id: "4",
            name: "Partner",
            category: "PURCHASE",
            status: "ENABLED",
            countingType: "MANY_PER_CLICK",
            attributionModel: "EXTERNAL",
          },
        ],
      }),
    })
    render("4")

    expect(options()).toEqual([{ value: "4", disabled: true }])
    expect(container.textContent).toContain(
      "googleAds.conversionFields.externalOption:Partner",
    )
    expect(container.textContent).toContain(
      "googleAds.conversionFields.unavailableWarning",
    )
  })

  test("asks for a reconnect when the connection needs reauth", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: connected({ readiness: "needs_reauth" }),
    })
    render("1")

    expect(container.textContent).toContain(
      "googleAds.conversionFields.needsReauth",
    )
  })
})

const KEY = "googleAds.conversionFields"
const VALUE_OR_CURRENCY_LABEL = /metaConversions\.fields\.(value|currency)$/
const LEAD_ACTION = "1"
const PURCHASE_ACTION = "5"
const LEGACY_DETAILS = { uploadMethod: "legacy" }

const PURCHASE_RESOURCE = {
  id: PURCHASE_ACTION,
  name: "Purchase",
  category: "PURCHASE",
  status: "ENABLED",
  countingType: "MANY_PER_CLICK",
}

const mockConnected = (overrides: Record<string, unknown> = {}) =>
  mocks.query.mockReturnValue({
    isPending: false,
    isError: false,
    data: connected({
      conversionActions: [...connected().conversionActions, PURCHASE_RESOURCE],
      ...overrides,
    }),
  })

const group = () =>
  container.querySelector<HTMLSelectElement>(
    '[data-testid="select-dedupMode"]',
  ) as HTMLSelectElement
const modeHint = () =>
  container.querySelector('[data-testid="description-dedupMode"]')?.textContent
const chooseMode = (value: string) => choose("dedupMode", value)
const checkedMode = () => ({
  click: String(group().value === "click"),
  id: String(group().value === "id"),
})

const choose = (name: string, value: string) => {
  const select = container.querySelector(
    `[data-testid="select-${name}"]`,
  ) as HTMLSelectElement
  act(() => {
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
const templateInput = (name: string) =>
  container.querySelector<HTMLInputElement>(`[data-testid="template-${name}"]`)
const typeInInput = (name: string, value: string) => {
  const input = templateInput(name) as HTMLInputElement
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
const blur = (element: HTMLElement) =>
  act(() => {
    element.focus()
    element.blur()
  })
const disclosureTrigger = () =>
  container.querySelector<HTMLElement>(
    '[data-slot="collapsible-trigger"]',
  ) as HTMLElement
const disclosurePanel = () =>
  container.querySelector<HTMLElement>(
    '[data-slot="collapsible-content"]',
  ) as HTMLElement
const settle = () => act(async () => await Promise.resolve())

describe("dedup mode select", () => {
  beforeEach(() => mockConnected())

  test("is an unlabeled select below the action and above value, with the hint under it", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    // No visible labels: the select values speak for themselves.
    expect(container.textContent).not.toContain(`${KEY}.dedupMode:`)
    expect(container.textContent).not.toContain("Avoid duplicate")
    expect(modeHint()).toBe(`${KEY}.dedupModeIdHelp`)
    chooseMode("click")
    expect(modeHint()).toBe(`${KEY}.dedupClickNote`)
    const order = [
      container.querySelector('[data-testid="select-conversionActionId"]'),
      group(),
      templateInput("value"),
      disclosureTrigger(),
    ] as Node[]
    const domOrder = Array.from(container.querySelectorAll("*"))
    const positions = order.map((node) => domOrder.indexOf(node as Element))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions).not.toContain(-1)
  })

  test("shows no dedup select before an action is chosen but defaults the mode to id", () => {
    render()

    expect(
      container.querySelector('[data-testid="select-dedupMode"]'),
    ).toBeNull()
    expect(formRef.getValues("dedupMode")).toBe("id")
  })

  test("defaults by category on a new step without marking the mode explicit", () => {
    render()

    choose("conversionActionId", LEAD_ACTION)
    expect(checkedMode()).toEqual({ click: "true", id: "false" })
    choose("conversionActionId", PURCHASE_ACTION)
    expect(checkedMode()).toEqual({ click: "false", id: "true" })
    expect(formRef.getValues("dedupMode")).toBe("id")
  })

  test("a saved step keeps its mode on mount and when the action changes", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "click" })

    expect(checkedMode()).toEqual({ click: "true", id: "false" })
    choose("conversionActionId", LEAD_ACTION)
    expect(checkedMode()).toEqual({ click: "true", id: "false" })
    choose("conversionActionId", PURCHASE_ACTION)
    expect(checkedMode()).toEqual({ click: "true", id: "false" })
  })

  test("a saved lead step in id mode stays id when the action changes", () => {
    renderWith({
      conversionActionId: PURCHASE_ACTION,
      dedupMode: "id",
      dedupId: "A-1",
    })

    choose("conversionActionId", LEAD_ACTION)
    expect(checkedMode()).toEqual({ click: "false", id: "true" })
  })

  test("once the user chose click then id, a lead action no longer changes the mode", () => {
    render()
    choose("conversionActionId", PURCHASE_ACTION)
    chooseMode("click")
    expect(checkedMode()).toEqual({ click: "true", id: "false" })
    chooseMode("id")
    expect(checkedMode()).toEqual({ click: "false", id: "true" })

    choose("conversionActionId", LEAD_ACTION)

    expect(checkedMode()).toEqual({ click: "false", id: "true" })
    expect(formRef.getValues("dedupMode")).toBe("id")
  })

  test("form.reset moves the visible selected mode", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })
    expect(checkedMode().id).toBe("true")

    act(() =>
      formRef.reset({ conversionActionId: LEAD_ACTION, dedupMode: "click" }),
    )
    expect(checkedMode()).toEqual({ click: "true", id: "false" })

    act(() =>
      formRef.reset({ conversionActionId: LEAD_ACTION, dedupMode: "id" }),
    )
    expect(checkedMode()).toEqual({ click: "false", id: "true" })
  })

  test("a step saved without a mode shows the default instead of crashing", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION })

    expect(checkedMode()).toEqual({ click: "false", id: "true" })
  })

  test("works under a parent name", () => {
    renderWith(
      { action: { conversionActionId: PURCHASE_ACTION } } as Defaults,
      "action",
    )

    expect(templateInput("action.dedupId")).not.toBeNull()
    expect(formRef.getValues("action.dedupMode" as never)).toBe("id")
  })
})

describe("customer matching section", () => {
  beforeEach(() => mockConnected())

  const matching = () =>
    container.querySelector<HTMLElement>('[data-testid="customer-matching"]')

  test("is wired to the matchEmail and matchPhone fields", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    expect(matching()?.dataset.emailName).toBe("matchEmail")
    expect(matching()?.dataset.phoneName).toBe("matchPhone")
    expect(matching()?.dataset.legacy).toBe("false")
  })

  test("follows the parent name used by the trigger editor", () => {
    renderWith(
      { conversionActionId: PURCHASE_ACTION, dedupMode: "id" },
      "action",
    )

    expect(matching()?.dataset.emailName).toBe("action.matchEmail")
  })
})

describe("every-run dedup option", () => {
  beforeEach(() => mockConnected())

  test("offers a third option and explains it under the select", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    chooseMode("event")

    expect(modeHint()).toBe(`${KEY}.dedupModeEventHelp`)
  })

  test("has no order or event ID input in event mode and keeps its value for later", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })
    typeInInput("dedupId", "A-1")

    chooseMode("event")
    expect(templateInput("dedupId")).toBeNull()
    chooseMode("id")

    expect(templateInput("dedupId")?.value).toBe("A-1")
  })

  test("a step saved in event mode keeps it on mount", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "event" })

    expect(modeHint()).toBe(`${KEY}.dedupModeEventHelp`)
    expect(templateInput("dedupId")).toBeNull()
  })
})

describe("order or event ID field", () => {
  beforeEach(() => mockConnected())

  test("renders only in id mode and keeps its value across toggles", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })
    expect(templateInput("dedupId")).not.toBeNull()
    typeInInput("dedupId", "A-1")

    chooseMode("click")
    expect(templateInput("dedupId")).toBeNull()
    chooseMode("id")

    expect(templateInput("dedupId")?.value).toBe("A-1")
  })

  test("a too-long ID typed in id mode no longer blocks validation after switching to click", async () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })
    typeInInput("dedupId", "x".repeat(65))
    await act(async () => {
      await formRef.trigger()
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      `${KEY}.validation.dedupIdTooLong`,
    )

    chooseMode("click")
    let valid = false
    await act(async () => {
      valid = await formRef.trigger()
    })

    expect(valid).toBe(true)
    expect(container.textContent).not.toContain(
      `${KEY}.validation.dedupIdTooLong`,
    )
  })

  test("keeps the long guidance behind an info button, not as a paragraph", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    const info = container.querySelector("[data-testid=info-dedupId]")
    expect(info?.closest("button")?.getAttribute("aria-label")).toBe(
      `${KEY}.dedupIdInfoLabel`,
    )
    expect(info?.textContent).toContain(`${KEY}.dedupIdHelp`)
    expect(info?.textContent).toContain(
      `${KEY}.dedupIdExample:{{user_id}}-{{order_number}}`,
    )
  })

  test("shows no error when the step opens with an empty ID", async () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })
    await settle()

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).not.toContain(
      `${KEY}.validation.dedupIdRequired`,
    )
  })

  test("shows the translated required error on blur", async () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    blur(templateInput("dedupId") as HTMLElement)
    await settle()

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      `${KEY}.validation.dedupIdRequired`,
    )
  })
})

describe("override notes", () => {
  test("a lead action in id mode explains that each ID is a new lead", () => {
    mockConnected()
    renderWith({ conversionActionId: LEAD_ACTION, dedupMode: "id" })

    expect(container.textContent).toContain(`${KEY}.dedupLeadIdNote`)
    expect(container.textContent).not.toContain(`${KEY}.dedupClickNote`)
  })

  test("a purchase action in click mode warns that repeat purchases are not counted", () => {
    mockConnected()
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "click" })

    expect(container.textContent).toContain(`${KEY}.dedupClickNote`)
    expect(container.textContent).not.toContain(`${KEY}.dedupLeadIdNote`)
  })

  test("the defaults carry no override note", () => {
    mockConnected()
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    expect(container.textContent).not.toContain(`${KEY}.dedupLeadIdNote`)
    expect(container.textContent).not.toContain(`${KEY}.dedupClickNote`)
    expect(container.textContent).not.toContain(`${KEY}.dedupLegacyNote`)
  })

  test("a legacy connection in id mode says Google receives a scrambled ID", () => {
    mockConnected(LEGACY_DETAILS)
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    expect(container.textContent).toContain(`${KEY}.dedupLegacyNote`)
  })

  test("a legacy connection in click mode has no ID note", () => {
    mockConnected(LEGACY_DETAILS)
    renderWith({ conversionActionId: LEAD_ACTION, dedupMode: "click" })

    expect(container.textContent).not.toContain(`${KEY}.dedupLegacyNote`)
  })
})

describe("additional options disclosure", () => {
  beforeEach(() => mockConnected())

  test("holds only the conversion time, collapsed when empty", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    expect(disclosureTrigger().getAttribute("aria-expanded")).toBe("false")
    expect(disclosureTrigger().textContent).not.toContain(
      "additionalOptionsCount",
    )
    expect(disclosurePanel().contains(templateInput("conversionTime"))).toBe(
      true,
    )
    for (const name of ["value", "currency", "dedupId"]) {
      expect(disclosurePanel().contains(templateInput(name))).toBe(false)
    }
  })

  test("opens on mount when a conversion time is set", () => {
    renderWith({
      conversionActionId: PURCHASE_ACTION,
      dedupMode: "id",
      conversionTime: "2026-10-08T14:30:00+07:00",
    })

    expect(disclosureTrigger().getAttribute("aria-expanded")).toBe("true")
    expect(disclosureTrigger().textContent).toContain(
      `${KEY}.additionalOptionsCount:1`,
    )
  })

  test("opens on mount when the saved conversion time is already invalid", async () => {
    renderWith({
      conversionActionId: PURCHASE_ACTION,
      dedupMode: "id",
      conversionTime: "not a date",
    })
    await act(async () => {
      await formRef.trigger()
    })

    expect(disclosureTrigger().getAttribute("aria-expanded")).toBe("true")
    expect(container.textContent).toContain(`${KEY}.validation.timeFormat`)
  })

  test("opens when a new conversion time error appears", async () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })
    expect(disclosureTrigger().getAttribute("aria-expanded")).toBe("false")

    act(() => formRef.setValue("conversionTime", "not a date"))
    await act(async () => {
      await formRef.trigger()
    })

    // Opens on a NEW error (what a failed save does).
    expect(disclosureTrigger().getAttribute("aria-expanded")).toBe("true")
    expect(container.textContent).toContain(`${KEY}.validation.timeFormat`)
  })

  test("can be collapsed with a value set and still shows how many are set", () => {
    renderWith({
      conversionActionId: PURCHASE_ACTION,
      dedupMode: "id",
      conversionTime: "2026-10-08T14:30:00+07:00",
    })

    act(() => disclosureTrigger().click())

    expect(disclosureTrigger().getAttribute("aria-expanded")).toBe("false")
    expect(disclosureTrigger().textContent).toContain(
      `${KEY}.additionalOptionsCount:1`,
    )
    expect(templateInput("conversionTime")).not.toBeNull()
  })
})

describe("customer properties fields", () => {
  beforeEach(() => mockConnected())

  test("are template inputs next to value and currency, not in the additional options", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    for (const name of ["customerType", "customerValueBucket"]) {
      expect(templateInput(name)).not.toBeNull()
      expect(disclosurePanel().contains(templateInput(name))).toBe(false)
    }
    expect(container.textContent).not.toContain(
      `${KEY}.customerPropertiesLegacy`,
    )
  })

  test("a legacy connection explains that they are not sent instead of showing inputs", () => {
    mockConnected(LEGACY_DETAILS)
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    expect(templateInput("customerType")).toBeNull()
    expect(templateInput("customerValueBucket")).toBeNull()
    expect(container.textContent).toContain(`${KEY}.customerPropertiesLegacy`)
  })
})

describe("consent line", () => {
  const consentText = () =>
    container.querySelector('[data-testid="google-ads-consent-line"]')

  test("shows a link to Google's documentation, and no consent warning, when consent is readable", () => {
    mockConnected()
    render(PURCHASE_ACTION)

    expect(consentText()).toBeNull()
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href*="developers.google.com/data-manager"]',
    )
    expect(link?.textContent).toContain(`${KEY}.learnMore`)
    expect(link?.getAttribute("target")).toBe("_blank")
  })

  test("warns in amber with a fix link when the saved consent is unreadable", () => {
    mockConnected({
      consent: { status: "invalid", adUserData: null, adPersonalization: null },
    })
    render(PURCHASE_ACTION)

    const line = consentText()
    expect(line?.textContent).toContain(`${KEY}.consentInvalid`)
    expect(line?.textContent).toContain(`${KEY}.consentFixLink`)
    expect(line?.className).toContain("text-amber-600")
  })
})

describe("value and currency", () => {
  beforeEach(() => mockConnected())

  test("keep short labels with no wrapping optional suffix", () => {
    renderWith({ conversionActionId: PURCHASE_ACTION, dedupMode: "id" })

    const labels = Array.from(container.querySelectorAll("span"))
      .map((node) => node.textContent)
      .filter((text) => VALUE_OR_CURRENCY_LABEL.test(text ?? ""))
    expect(labels).toEqual([
      "metaConversions.fields.value",
      "metaConversions.fields.currency",
    ])
  })

  test("shows the translated error when only one of them is set", async () => {
    mockConnected()
    renderWith({
      conversionActionId: PURCHASE_ACTION,
      dedupMode: "id",
      dedupId: "A-1",
    })

    typeInInput("value", "9.90")
    await act(async () => {
      await formRef.trigger()
    })

    expect(container.textContent).toContain(
      `${KEY}.validation.currencyRequired`,
    )
  })
})
