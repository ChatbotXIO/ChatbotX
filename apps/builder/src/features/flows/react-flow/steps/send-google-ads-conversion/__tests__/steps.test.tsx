// @vitest-environment jsdom
import {
  sendGoogleAdsConversionDefaultFn,
  sendGoogleAdsConversionSchema,
} from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { sendGoogleAdsConversionStep } from ".."
import SendGoogleAdsConversionViewer from "../viewer"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}))
vi.mock("@/components/base-handle", () => ({
  BaseHandle: ({ id }: { id?: string | null }) => (
    <span data-handleid={id ?? ""} />
  ),
}))
vi.mock(
  "@/features/integration-google-ads/components/google-ads-conversion-fields",
  () => ({
    GoogleAdsConversionFields: ({ parentName }: { parentName: string }) => (
      <div data-parent={parentName} data-testid="fields" />
    ),
  }),
)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("sendGoogleAdsConversion step definition", () => {
  test("wires the schema, default and components", () => {
    expect(sendGoogleAdsConversionStep.validator).toBe(
      sendGoogleAdsConversionSchema,
    )
    expect(sendGoogleAdsConversionStep.defaultFn).toBe(
      sendGoogleAdsConversionDefaultFn,
    )
    expect(sendGoogleAdsConversionStep.editor).toBeDefined()
    expect(sendGoogleAdsConversionStep.viewer).toBeDefined()
  })
})

describe("sendGoogleAdsConversion step round trip", () => {
  const configured = {
    ...sendGoogleAdsConversionDefaultFn(),
    conversionActionId: "42",
    value: "9.90",
    currency: "USD",
    conversionTime: "2026-10-08T14:30:00+07:00",
  }

  test.each([
    { dedupMode: "id" as const, dedupId: "{{order_number}}" },
    { dedupMode: "click" as const, dedupId: undefined },
  ])("keeps $dedupMode mode, the ID and the conversion time", (dedup) => {
    const step = { ...configured, ...dedup }

    expect(sendGoogleAdsConversionSchema.parse(step)).toEqual(step)
  })

  test("a new step starts in id mode and needs an ID before it can be saved", () => {
    const step = {
      ...sendGoogleAdsConversionDefaultFn(),
      conversionActionId: "42",
    }

    expect(step.dedupMode).toBe("id")
    expect(sendGoogleAdsConversionSchema.safeParse(step).success).toBe(false)
  })
})

describe("SendGoogleAdsConversionViewer", () => {
  test("prompts to configure a fresh step and renders both states", () => {
    const data = sendGoogleAdsConversionDefaultFn()
    act(() => root.render(<SendGoogleAdsConversionViewer data={data} />))

    expect(container.textContent).toContain(
      "flows.actions.sendGoogleAdsConversion",
    )
    expect(container.textContent).toContain("googleAds.summary.notConfigured")
    expect(container.querySelectorAll("[data-handleid]").length).toBe(
      data.states.length,
    )
  })

  test("summarises a configured step", () => {
    const data = {
      ...sendGoogleAdsConversionDefaultFn(),
      conversionActionId: "42",
      value: "9.90",
      currency: "USD",
      dedupMode: "id" as const,
      dedupId: "O-7",
    }
    act(() => root.render(<SendGoogleAdsConversionViewer data={data} />))

    expect(container.textContent).toContain(
      "googleAds.summary.conversionAction:42",
    )
    expect(container.textContent).toContain("9.90 USD")
    expect(container.textContent).toContain("googleAds.summary.dedupId:O-7")
  })

  test("summarises a click-mode step as once per ad click", () => {
    const data = {
      ...sendGoogleAdsConversionDefaultFn(),
      conversionActionId: "42",
      dedupMode: "click" as const,
    }
    act(() => root.render(<SendGoogleAdsConversionViewer data={data} />))

    expect(container.textContent).toContain("googleAds.summary.dedupClick")
  })
})
