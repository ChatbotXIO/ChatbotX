import { describe, expect, test } from "vitest"
import { buildConversionActionOptions } from "@/features/integration-google-ads/lib/conversion-action-options"
import { getGoogleAdsConversionSummaryLines } from "@/features/integration-google-ads/lib/conversion-summary"

const action = (id: string, status: string) => ({
  id,
  name: `Action ${id}`,
  category: "SIGNUP",
  status,
  countingType: "ONE_PER_CLICK",
  attributionModel: null,
})

const unavailableLabel = (id: string) => `missing:${id}`
const externalLabel = (name: string) => `external:${name}`

describe("buildConversionActionOptions", () => {
  test("enables ENABLED actions and disables the others", () => {
    const result = buildConversionActionOptions({
      actions: [action("1", "ENABLED"), action("2", "REMOVED")],
      selectedId: undefined,
      unavailableLabel,
      externalLabel,
    })

    expect(result.options).toEqual([
      { value: "1", label: "Action 1", disabled: false },
      { value: "2", label: "Action 2", disabled: true },
    ])
    expect(result.hasSelectableAction).toBe(true)
    expect(result.isSelectedUnavailable).toBe(false)
  })

  test("keeps a stored id missing from the list visible and flags it", () => {
    const result = buildConversionActionOptions({
      actions: [action("1", "ENABLED")],
      selectedId: "99",
      unavailableLabel,
      externalLabel,
    })

    expect(result.options[0]).toEqual({
      value: "99",
      label: "missing:99",
      disabled: true,
    })
    expect(result.isSelectedUnavailable).toBe(true)
  })

  test("flags a selected action that is no longer ENABLED", () => {
    const result = buildConversionActionOptions({
      actions: [action("1", "PAUSED")],
      selectedId: "1",
      unavailableLabel,
      externalLabel,
    })

    expect(result.isSelectedUnavailable).toBe(true)
    expect(result.hasSelectableAction).toBe(false)
  })

  test("lists an external-attribution action disabled, with its own label", () => {
    const result = buildConversionActionOptions({
      actions: [
        action("1", "ENABLED"),
        { ...action("2", "ENABLED"), attributionModel: "EXTERNAL" },
        { ...action("3", "ENABLED"), attributionModel: null },
      ],
      selectedId: undefined,
      unavailableLabel,
      externalLabel,
    })

    expect(result.options).toEqual([
      { value: "1", label: "Action 1", disabled: false },
      { value: "2", label: "external:Action 2", disabled: true },
      { value: "3", label: "Action 3", disabled: false },
    ])
  })

  test("flags a stored external action as unavailable and only that one selectable list is empty", () => {
    const result = buildConversionActionOptions({
      actions: [{ ...action("2", "ENABLED"), attributionModel: "EXTERNAL" }],
      selectedId: "2",
      unavailableLabel,
      externalLabel,
    })

    expect(result.isSelectedUnavailable).toBe(true)
    expect(result.hasSelectableAction).toBe(false)
  })

  test("reports no selectable action for an empty list", () => {
    expect(
      buildConversionActionOptions({
        actions: [],
        selectedId: undefined,
        unavailableLabel,
        externalLabel,
      }).hasSelectableAction,
    ).toBe(false)
  })
})

describe("getGoogleAdsConversionSummaryLines", () => {
  const t = ((key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key) as never

  test("prompts to configure when no action is chosen", () => {
    expect(getGoogleAdsConversionSummaryLines({}, t)).toEqual([
      "googleAds.summary.notConfigured",
    ])
  })

  test("lists action, value with currency and the dedup ID", () => {
    expect(
      getGoogleAdsConversionSummaryLines(
        {
          conversionActionId: "7",
          value: "10",
          currency: "USD",
          dedupId: "O-1",
        },
        t,
      ),
    ).toEqual([
      "googleAds.summary.conversionAction:7",
      "10 USD",
      "googleAds.summary.dedupId:O-1",
    ])
  })
})
