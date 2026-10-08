// @vitest-environment jsdom
import { googleAdsConversionErrorCodes } from "@chatbotx.io/utils/google-click"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { getColumns } from "@/features/error-logs/error-logs-table-columns"
import { resolveErrorLogDetail } from "@/features/error-logs/google-ads-error-detail"
import { type Mounted, mount, translate } from "./helpers/google-ads-ui"

type Translate = Parameters<typeof resolveErrorLogDetail>[0]
const KNOWN_VALIDATION_KEY =
  "googleAds.conversionFields.validation.dedupIdRequired"
const t: Translate = Object.assign(
  (key: string) =>
    key === KNOWN_VALIDATION_KEY ? "Enter an ID" : translate(key),
  {
    has: (key: string) => key === KNOWN_VALIDATION_KEY,
  },
)

describe("resolveErrorLogDetail", () => {
  test("a known code on a google-ads row is translated, keeping the other lines", () => {
    const detail = [
      googleAdsConversionErrorCodes.invalidDedupId,
      'Resolved: dedupId="x"',
    ].join("\n")

    expect(resolveErrorLogDetail(t, "google-ads", detail)).toBe(
      'googleAds.stepErrors.google_ads_invalid_dedup_id\nResolved: dedupId="x"',
    )
  })

  test("a bare code is translated alone", () => {
    expect(resolveErrorLogDetail(t, "google-ads", "google_ads_no_click")).toBe(
      "googleAds.stepErrors.google_ads_no_click",
    )
  })

  test("unknown text is unchanged", () => {
    expect(
      resolveErrorLogDetail(t, "google-ads", "Request failed with 403"),
    ).toBe("Request failed with 403")
    expect(
      resolveErrorLogDetail(t, "google-ads", "google_ads_made_up\nmore"),
    ).toBe("google_ads_made_up\nmore")
  })

  test("other providers are never translated, even with a matching first line", () => {
    expect(
      resolveErrorLogDetail(t, "meta-conversions", "google_ads_no_click"),
    ).toBe("google_ads_no_click")
  })

  test("every error code resolves to its own translation key", () => {
    for (const code of Object.values(googleAdsConversionErrorCodes)) {
      expect(resolveErrorLogDetail(t, "google-ads", code)).toBe(
        `googleAds.stepErrors.${code}`,
      )
    }
  })

  test("a `<path>: <googleAds key>` detail line is translated when the key exists", () => {
    const detail = `google_ads_invalid_input\ndedupId: ${KNOWN_VALIDATION_KEY}\nvalue: googleAds.unknown.key\nplain text`

    expect(resolveErrorLogDetail(t, "google-ads", detail)).toBe(
      "googleAds.stepErrors.google_ads_invalid_input\ndedupId: Enter an ID\nvalue: googleAds.unknown.key\nplain text",
    )
  })
})

describe("error log table: description column", () => {
  let ui: Mounted
  beforeEach(() => {
    ui = mount()
  })
  afterEach(() => ui.unmount())

  const renderDetail = (action: string, detail: string) => {
    const column = getColumns({
      t: ((key: string) => key) as never,
      setRowAction: () => undefined,
    }).find(
      (candidate) =>
        "accessorKey" in candidate && candidate.accessorKey === "detail",
    )
    const cell = column?.cell as (context: unknown) => ReactElement
    ui.render(cell({ row: { original: { action, detail } } }))
    return ui.container.textContent ?? ""
  }

  test("pins the columns: provider in action, message in detail", () => {
    const text = renderDetail("google-ads", "google_ads_no_account")

    expect(text).toContain("googleAds.stepErrors.google_ads_no_account")
  })

  test("a non google-ads row renders its detail verbatim", () => {
    expect(renderDetail("whatsapp", "google_ads_no_account")).toContain(
      "google_ads_no_account",
    )
  })
})
