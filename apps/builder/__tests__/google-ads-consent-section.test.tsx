// @vitest-environment jsdom

import "./helpers/tiptap-jsdom-shims"
import { googleAdsConsentSchema } from "@chatbotx.io/database/partials"
import { act, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { type Mounted, mount } from "./helpers/google-ads-ui"
import { settle, typeInto } from "./helpers/tiptap-jsdom"

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  order: [] as string[],
}))

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key
    t.has = (key: string) => key.startsWith("googleAds.")
    return t
  },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock(
  "@/features/integration-google-ads/hooks/use-invalidate-google-ads",
  () => ({ useInvalidateGoogleAds: () => mocks.invalidate }),
)
vi.mock(
  "@/features/integration-google-ads/actions/update-consent.action",
  () => ({ updateGoogleAdsConsentAction: mocks.action }),
)
vi.mock("@/components/tiptap/use-prompt-variable-options", () => ({
  usePromptVariableOptions: () => [],
}))
// Mirrors the real Select: the root keeps only `id` / value / disabled (it drops
// aria-*, so a helper attached to the root is never announced) and hands them to
// the trigger, which is where aria-describedby must live. The trigger renders as a
// native <select> so the tests can drive it.
vi.mock("@chatbotx.io/ui/components/ui/select", async () => {
  const { createContext, useContext } = await import("react")
  type Items = { value: string; label: string }[]
  type Root = {
    id?: string
    value: string
    disabled?: boolean
    items: Items
    onValueChange: (value: string) => void
  }
  const RootContext = createContext<Root | null>(null)
  return {
    Select: ({
      children,
      id,
      value,
      disabled,
      items = [],
      onValueChange,
    }: Partial<Root> & { children: ReactNode; value: string }) => (
      <RootContext.Provider
        value={{
          id,
          value,
          disabled,
          items,
          onValueChange: onValueChange ?? (() => undefined),
        }}
      >
        {children}
      </RootContext.Provider>
    ),
    SelectTrigger: ({
      "aria-describedby": describedBy,
      "aria-invalid": invalid,
    }: {
      "aria-describedby"?: string
      "aria-invalid"?: boolean
    }) => {
      const root = useContext(RootContext) as Root
      return (
        <select
          aria-describedby={describedBy}
          aria-invalid={invalid}
          disabled={root.disabled}
          id={root.id}
          onChange={(event) => root.onValueChange(event.target.value)}
          value={root.value}
        >
          {root.items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      )
    },
    SelectValue: () => null,
    SelectContent: () => null,
    SelectItem: () => null,
  }
})

import { ConsentSection } from "@/features/integration-google-ads/components/consent-section"
import type { GoogleAdsConsentView } from "@/features/integration-google-ads/schema/integration"

const ABSENT: GoogleAdsConsentView = {
  status: "absent",
  adUserData: { type: "notProvided", template: null },
  adPersonalization: { type: "notProvided", template: null },
}
const INVALID: GoogleAdsConsentView = {
  status: "invalid",
  adUserData: null,
  adPersonalization: null,
}
const VARIABLE: GoogleAdsConsentView = {
  status: "ok",
  adUserData: { type: "variable", template: "{{gdpr_consent}}" },
  adPersonalization: { type: "granted", template: null },
}

let host: Mounted

const render = async (
  consent: GoogleAdsConsentView,
  uploadMethod: "dataManager" | "legacy" | null = "dataManager",
) => {
  host.render(
    <ConsentSection
      consent={consent}
      uploadMethod={uploadMethod}
      workspaceId="ws-1"
    />,
  )
  await settle()
}

const selects = () =>
  Array.from(host.container.querySelectorAll<HTMLSelectElement>("select"))
const editors = () =>
  Array.from(host.container.querySelectorAll<HTMLElement>("[contenteditable]"))
const save = () =>
  Array.from(host.container.querySelectorAll("button")).find(
    (button) => button.textContent === "googleAds.consent.save",
  ) as HTMLButtonElement
const learnMore = () =>
  host.container.querySelector<HTMLAnchorElement>("a[href]") as HTMLElement

/** Unrelated, non-nested nodes: FOLLOWING is exactly "b comes after a". */
const isBefore = (a: Node, b: Node) =>
  a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING

const choose = async (select: HTMLSelectElement, value: string) => {
  act(() => {
    // React tracks the value setter; go through the prototype so onChange fires.
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set?.call(select, value)
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await settle()
}

const submit = async () => {
  await act(async () => save().click())
  await settle()
}

const savedPayload = () => {
  const call = mocks.action.mock.calls.at(-1)
  return call ? googleAdsConsentSchema.parse(call[1]) : null
}

beforeEach(() => {
  host = mount()
  mocks.order.length = 0
  mocks.action.mockReset()
  mocks.action.mockImplementation((_workspaceId: string, input: unknown) =>
    Promise.resolve({ data: googleAdsConsentSchema.parse(input) }),
  )
  mocks.refresh
    .mockReset()
    .mockImplementation(() => mocks.order.push("refresh"))
  mocks.invalidate.mockReset().mockImplementation(() => {
    mocks.order.push("invalidate")
    return Promise.resolve()
  })
  mocks.toastError.mockReset()
  mocks.toastSuccess.mockReset()
})
afterEach(() => host.unmount())

describe("ConsentSection states", () => {
  test("absent: both settings start at Not provided and Save is disabled until a change", async () => {
    await render(ABSENT)
    expect(selects().map((select) => select.value)).toEqual([
      "notProvided",
      "notProvided",
    ])
    expect(editors()).toHaveLength(0)
    expect(save().disabled).toBe(true)

    await choose(selects()[0] as HTMLSelectElement, "granted")
    expect(save().disabled).toBe(false)
  })

  test("choosing 'From a contact field' and going back leaves the form pristine", async () => {
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, "variable")
    expect(save().disabled).toBe(false)

    await choose(selects()[0] as HTMLSelectElement, "notProvided")
    expect(save().disabled).toBe(true)
  })

  test("shows the title, the description and a safe Learn more link", async () => {
    await render(ABSENT)
    expect(host.container.textContent).toContain("googleAds.consent.title")
    expect(host.container.textContent).toContain(
      "googleAds.consent.description",
    )
    const link = learnMore()
    expect(link.getAttribute("href")).toBe(
      "https://support.google.com/google-ads-data-manager/answer/13944739",
    )
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
  })

  test.each([
    ["notProvided", "googleAds.consent.help.notProvided"],
    ["granted", "googleAds.consent.help.granted"],
    ["denied", "googleAds.consent.help.denied"],
  ])("source %s shows its helper text and no template input", async (source, help) => {
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, source)
    expect(host.container.textContent).toContain(help)
    expect(editors()).toHaveLength(0)
  })

  test("the template input appears only for 'From a contact field', with its helper", async () => {
    await render(ABSENT)
    expect(editors()).toHaveLength(0)

    await choose(selects()[0] as HTMLSelectElement, "variable")
    expect(editors()).toHaveLength(1)
    expect(host.container.textContent).toContain(
      "googleAds.consent.help.variable:granted,denied",
    )
    expect(host.container.textContent).not.toContain(
      "googleAds.consent.help.notProvided:",
    )

    await choose(selects()[0] as HTMLSelectElement, "granted")
    expect(editors()).toHaveLength(0)
  })

  test("stored values are shown, including the template", async () => {
    await render(VARIABLE)
    expect(selects().map((select) => select.value)).toEqual([
      "variable",
      "granted",
    ])
    expect(editors()[0]?.textContent).toBe("{{gdpr_consent}}")
    expect(save().disabled).toBe(true)
  })

  test("legacy upload method shows a status warning under Ad personalization", async () => {
    await render(ABSENT, "legacy")
    const status = host.container.querySelector('[role="status"]')
    expect(status?.textContent).toContain("googleAds.consent.legacy.title")
    expect(status?.textContent).toContain("googleAds.consent.legacy.body")
    const personalization = selects()[1] as HTMLSelectElement
    expect(isBefore(personalization, status as Node)).toBe(true)
  })

  test("Data Manager shows no legacy warning", async () => {
    await render(ABSENT, "dataManager")
    expect(host.container.querySelector('[role="status"]')).toBeNull()
  })

  test("not connected: editable, with the muted line and no legacy warning", async () => {
    await render(ABSENT, null)
    expect(host.container.textContent).toContain(
      "googleAds.consent.notConnected",
    )
    expect(host.container.querySelector('[role="status"]')).toBeNull()
    expect(selects().every((select) => !select.disabled)).toBe(true)
    await choose(selects()[1] as HTMLSelectElement, "denied")
    expect(save().disabled).toBe(false)
  })

  test("connected: no 'not connected' line", async () => {
    await render(ABSENT)
    expect(host.container.textContent).not.toContain(
      "googleAds.consent.notConnected",
    )
  })
})

describe("ConsentSection invalid stored settings", () => {
  test("shows a destructive alert, starts at Not provided and keeps Save enabled while pristine", async () => {
    await render(INVALID)
    const alert = host.container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain("googleAds.consent.invalidStored")
    expect(selects().map((select) => select.value)).toEqual([
      "notProvided",
      "notProvided",
    ])
    expect(save().disabled).toBe(false)
  })

  test("saving without edits recovers: stores Not provided and clears the alert", async () => {
    await render(INVALID)
    await submit()
    expect(savedPayload()).toEqual({
      adUserData: { type: "notProvided" },
      adPersonalization: { type: "notProvided" },
    })
    expect(host.container.textContent).not.toContain(
      "googleAds.consent.invalidStored",
    )
    expect(save().disabled).toBe(true)
  })
})

describe("ConsentSection saving", () => {
  test("controls and Save are disabled while the save is in flight", async () => {
    let resolveSave: (value: unknown) => void = () => undefined
    mocks.action.mockImplementation(
      () => new Promise((resolve) => (resolveSave = resolve)),
    )
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, "denied")
    await submit()

    expect(save().disabled).toBe(true)
    expect(selects().every((select) => select.disabled)).toBe(true)
    expect(save().querySelector("svg.animate-spin")).not.toBeNull()

    await act(() =>
      Promise.resolve(
        resolveSave({
          data: {
            adUserData: { type: "denied" },
            adPersonalization: { type: "notProvided" },
          },
        }),
      ),
    )
    await settle()
    expect(selects().every((select) => !select.disabled)).toBe(true)
  })

  test("success: toast, invalidates the Google Ads queries and only then refreshes the page", async () => {
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, "granted")
    await submit()

    expect(mocks.action).toHaveBeenCalledTimes(1)
    expect(mocks.action.mock.calls[0]?.[0]).toBe("ws-1")
    expect(mocks.toastSuccess).toHaveBeenCalledWith("googleAds.consent.saved")
    expect(mocks.order).toEqual(["invalidate", "refresh"])
    expect(save().disabled).toBe(true)
  })

  test("error: toasts the server error, keeps the values and does not refresh", async () => {
    mocks.action.mockResolvedValue({ serverError: "boom" })
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, "denied")
    await submit()

    expect(mocks.toastError).toHaveBeenCalledWith("boom")
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
    expect(selects()[0]?.value).toBe("denied")
    expect(save().disabled).toBe(false)
  })

  test("a reset after save updates the visible source selects", async () => {
    // The server answer (not the user's pick) is what the form shows afterwards.
    mocks.action.mockResolvedValue({
      data: {
        adUserData: { type: "denied" },
        adPersonalization: { type: "granted" },
      },
    })
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, "granted")
    await submit()

    expect(selects().map((select) => select.value)).toEqual([
      "denied",
      "granted",
    ])
  })

  test("a reset after save updates the template editor", async () => {
    mocks.action.mockResolvedValue({
      data: {
        adUserData: { type: "variable", template: "{{normalized}}" },
        adPersonalization: { type: "notProvided" },
      },
    })
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, "variable")
    await typeInto(editors()[0] as HTMLElement, "{{typed}}")
    await submit()

    expect(editors()[0]?.textContent).toBe("{{normalized}}")
  })

  test("a template-less source is submitted without a template after leaving 'From a contact field'", async () => {
    await render(VARIABLE)
    await choose(selects()[0] as HTMLSelectElement, "denied")
    await submit()

    // The schema strip is the contract (plan §7.2): the resolver drops the
    // leftover template before the action is called.
    expect(savedPayload()?.adUserData).toEqual({ type: "denied" })
    expect(savedPayload()?.adPersonalization).toEqual({ type: "granted" })
  })

  test("a variable source is saved with its typed template", async () => {
    await render(ABSENT)
    await choose(selects()[1] as HTMLSelectElement, "variable")
    await typeInto(editors()[0] as HTMLElement, "{{gdpr_consent}}")
    await submit()

    expect(savedPayload()?.adPersonalization).toEqual({
      type: "variable",
      template: "{{gdpr_consent}}",
    })
  })

  test("an empty template is rejected with the translated message and nothing is sent", async () => {
    await render(ABSENT)
    await choose(selects()[0] as HTMLSelectElement, "variable")
    await submit()

    expect(mocks.action).not.toHaveBeenCalled()
    expect(
      host.container.querySelector('[role="alert"]')?.textContent,
    ).toContain("googleAds.consent.validation.templateRequired")
  })
})

describe("ConsentSection accessibility", () => {
  test("Tab order follows the visual order", async () => {
    await render(VARIABLE)
    const order = [
      learnMore(),
      selects()[0],
      editors()[0],
      selects()[1],
      save(),
    ] as Node[]
    for (let index = 1; index < order.length; index++) {
      expect(isBefore(order[index - 1] as Node, order[index] as Node)).toBe(
        true,
      )
    }
  })

  const idsText = (element: HTMLElement, attribute: string) =>
    (element.getAttribute(attribute) ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" | ")

  test("each select is named by its label and described by the source helper", async () => {
    await render(ABSENT)
    const [userData, personalization] = selects() as HTMLSelectElement[]
    expect(userData.labels?.[0]?.textContent).toContain(
      "googleAds.consent.adUserData.label",
    )
    expect(personalization.labels?.[0]?.textContent).toContain(
      "googleAds.consent.adPersonalization.label",
    )
    const described = idsText(userData, "aria-describedby")
    expect(described).toContain("googleAds.consent.help.notProvided")
  })

  test("the helper follows the chosen source in the select's description", async () => {
    await render(ABSENT)
    const userData = selects()[0] as HTMLSelectElement
    await choose(userData, "denied")
    const described = idsText(userData, "aria-describedby")
    expect(described).toContain("googleAds.consent.help.denied")
    expect(described).not.toContain("googleAds.consent.help.notProvided")
  })

  test("reading order is label, control, helper", async () => {
    await render(ABSENT)
    const userData = selects()[0] as HTMLSelectElement
    const label = userData.labels?.[0] as Node
    const helper = Array.from(host.container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("googleAds.consent.help.notProvided"),
    ) as Node
    expect(isBefore(label, userData)).toBe(true)
    expect(isBefore(userData, helper)).toBe(true)
  })

  test("each template editor has its own accessible name and is described by its helper", async () => {
    await render({
      status: "ok",
      adUserData: { type: "variable", template: "{{a}}" },
      adPersonalization: { type: "variable", template: "{{b}}" },
    })
    const [first, second] = editors() as HTMLElement[]
    const names = [first, second].map((editor) =>
      idsText(editor, "aria-labelledby"),
    )
    expect(names[0]).toContain("googleAds.consent.templateLabel")
    expect(names[0]).not.toBe(names[1])
    expect(names[0]).toContain("googleAds.consent.adUserData.label")
    expect(names[1]).toContain("googleAds.consent.adPersonalization.label")
    expect(idsText(first as HTMLElement, "aria-describedby")).toContain(
      "googleAds.consent.help.variable:granted,denied",
    )
  })
})
