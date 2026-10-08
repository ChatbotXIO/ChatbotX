// @vitest-environment jsdom
import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  onSuccess: undefined as
    | ((arg: { data: unknown }) => Promise<void> | void)
    | undefined,
  onError: undefined as
    | ((arg: { error: { serverError?: string } }) => Promise<void> | void)
    | undefined,
  calls: [] as string[],
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => mocks.calls.push("refresh") }),
}))
vi.mock(
  "@/features/integration-google-ads/hooks/use-invalidate-google-ads",
  () => ({
    useInvalidateGoogleAds: () => () => {
      mocks.calls.push("invalidate")
      return Promise.resolve()
    },
  }),
)

vi.mock("next-intl", async () =>
  (await import("./helpers/google-ads-ui")).nextIntlMock(),
)
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@chatbotx.io/ui/components/ui/select", async () =>
  (await import("./helpers/google-ads-ui")).selectMock(),
)
vi.mock(
  "@/features/integration-google-ads/actions/validate-request.action",
  () => ({
    validateGoogleAdsRequestAction: { bind: () => "validate" },
  }),
)
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    _id: string,
    options: {
      onSuccess?: (arg: { data: unknown }) => Promise<void> | void
      onError?: (arg: {
        error: { serverError?: string }
      }) => Promise<void> | void
    },
  ) => {
    mocks.onSuccess = options.onSuccess
    mocks.onError = options.onError
    return { execute: mocks.execute, isPending: false }
  },
}))

import { ValidateRequestDialog } from "@/features/integration-google-ads/components/validate-request-dialog"
import {
  buttonByText,
  click,
  type Mounted,
  mount,
} from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.execute.mockReset()
  mocks.calls.length = 0
})
afterEach(() => {
  ui.unmount()
  document.body.innerHTML = ""
})

const actions = [
  {
    id: "11",
    name: "Lead",
    category: "LEAD",
    status: "ENABLED",
    countingType: "ONE_PER_CLICK",
    attributionModel: null,
    lookbackDays: 30,
  },
  {
    id: "22",
    name: "Old",
    category: "LEAD",
    status: "REMOVED",
    countingType: "ONE_PER_CLICK",
    attributionModel: null,
    lookbackDays: 30,
  },
]

const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })

const settle = (data: unknown) =>
  act(async () => {
    await mocks.onSuccess?.({ data })
  })

const openDialog = () => {
  ui.render(<ValidateRequestDialog actions={actions} workspaceId="ws-1" />)
  click(buttonByText(document.body, "googleAds.validate.open"))
}

describe("ValidateRequestDialog", () => {
  test("trigger is disabled when no enabled conversion action exists", () => {
    ui.render(
      <ValidateRequestDialog actions={[actions[1]]} workspaceId="ws-1" />,
    )
    expect(
      buttonByText(document.body, "googleAds.validate.open")?.disabled,
    ).toBe(true)
  })

  test("is labelled as a configuration check and lists only enabled actions", () => {
    openDialog()
    expect(document.body.textContent).toContain(
      "googleAds.validate.description",
    )
    const labels = Array.from(document.body.querySelectorAll("option")).map(
      (o) => o.textContent,
    )
    expect(labels).toContain("Lead")
    expect(labels).not.toContain("Old")
  })

  test("rejects an invalid click id without calling the action", () => {
    openDialog()
    click(buttonByText(document.body, "googleAds.validate.submit"))
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("googleAds.validate.invalid")
  })

  test("submits a valid request and shows the outcome", async () => {
    openDialog()
    const [actionSelect] = Array.from(
      document.body.querySelectorAll<HTMLSelectElement>("select"),
    )
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set?.call(actionSelect, "11")
      actionSelect.dispatchEvent(new Event("change", { bubbles: true }))
    })
    type(
      document.body.querySelector<HTMLInputElement>(
        "input",
      ) as HTMLInputElement,
      "Cj0KCQiAabc_123-xyz",
    )
    click(buttonByText(document.body, "googleAds.validate.submit"))
    expect(mocks.execute).toHaveBeenCalledWith({
      conversionActionId: "11",
      clickIdType: "gclid",
      clickId: "Cj0KCQiAabc_123-xyz",
    })
    await settle({
      ok: true,
      consentSummary: { adUserData: "omitted", adPersonalization: "omitted" },
      variableSkipped: false,
    })
    expect(document.body.textContent).toContain("googleAds.validate.ok")
    await settle({ ok: false, code: "rejected", detail: "bad click" })
    expect(document.body.textContent).toContain(
      "googleAds.validate.reasons.rejected: bad click",
    )
    await settle({ ok: false, code: "needsReauth" })
    expect(document.body.textContent).toContain(
      "googleAds.validate.reasons.needsReauth",
    )
    expect(document.body.textContent).not.toContain("bad click")
    await settle({ ok: false, code: "accountNotReady" })
    expect(document.body.textContent).toContain(
      "googleAds.validate.reasons.accountNotReady",
    )
  })

  describe("consent summary", () => {
    const ok = (
      consentSummary: { adUserData: string; adPersonalization: string },
      extra: Record<string, unknown> = {},
    ) => ({ ok: true, consentSummary, variableSkipped: false, ...extra })

    test("lists the settings the test sent", async () => {
      openDialog()
      await settle(ok({ adUserData: "granted", adPersonalization: "denied" }))

      const text = document.body.textContent
      expect(text).toContain("googleAds.validate.consentIncluded")
      expect(text).toContain("googleAds.events.consent.adUserDataFull")
      expect(text).toContain("googleAds.events.consent.status.granted")
      expect(text).toContain("googleAds.events.consent.adPersonalizationFull")
      expect(text).toContain("googleAds.events.consent.status.denied")
      expect(text).not.toContain("googleAds.validate.consentNone")
      expect(text).not.toContain("googleAds.validate.consentNotSentLegacy")
      expect(text).not.toContain("googleAds.validate.consentVariableSkipped")
    })

    test("says no consent was included when everything is omitted", async () => {
      openDialog()
      await settle(ok({ adUserData: "omitted", adPersonalization: "omitted" }))

      expect(document.body.textContent).toContain(
        "googleAds.validate.consentNone",
      )
      expect(document.body.textContent).not.toContain(
        "googleAds.validate.consentIncluded",
      )
    })

    test("explains that a contact-field consent was left out", async () => {
      openDialog()
      await settle(
        ok(
          { adUserData: "omitted", adPersonalization: "denied" },
          { variableSkipped: true },
        ),
      )

      expect(document.body.textContent).toContain(
        "googleAds.validate.consentVariableSkipped",
      )
      expect(document.body.textContent).toContain(
        "googleAds.validate.consentIncluded",
      )
    })

    test("a legacy ad personalization is shown as not sent, never as included", async () => {
      openDialog()
      await settle(
        ok(
          { adUserData: "granted", adPersonalization: "notSentLegacy" },
          { withheldAdPersonalization: "denied" },
        ),
      )

      const text = document.body.textContent
      expect(text).toContain("googleAds.validate.consentNotSentLegacy")
      expect(text).not.toContain(
        "googleAds.events.consent.adPersonalizationFull",
      )
      expect(text).toContain("googleAds.events.consent.adUserDataFull")
    })

    test("a refused request shows the stored-consent message and no summary", async () => {
      openDialog()
      await settle({ ok: false, code: "consentInvalid" })

      expect(document.body.textContent).toContain(
        "googleAds.consent.invalidStored",
      )
      expect(document.body.textContent).not.toContain(
        "googleAds.validate.consentNone",
      )
    })
  })

  test.each([
    [
      "a successful validation",
      {
        ok: true,
        consentSummary: { adUserData: "omitted", adPersonalization: "omitted" },
        variableSkipped: false,
      },
    ],
    ["a rejected validation", { ok: false, code: "needsReauth" }],
  ])("%s invalidates Google Ads reads before refreshing", async (_label, data) => {
    openDialog()
    await act(async () => {
      await mocks.onSuccess?.({ data })
    })
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })

  test("a failed request still re-reads (tokens may have been refreshed)", async () => {
    openDialog()
    await act(async () => {
      await mocks.onError?.({ error: { serverError: "boom" } })
    })
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })
})
