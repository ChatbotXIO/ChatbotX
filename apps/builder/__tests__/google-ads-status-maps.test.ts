import {
  googleAdsClickIdTypeValues,
  googleAdsEventStatusValues,
  googleAdsFailureStageValues,
  googleAdsProcessingStatusValues,
  googleAdsSetupErrorSchema,
} from "@chatbotx.io/database/partials"
import {
  connectErrorQueryCodes,
  connectionStatuses,
  connectSessionErrorCodes,
} from "@chatbotx.io/utils/connection"
import { GOOGLE_ADS_CHANNEL_VALUES } from "@chatbotx.io/utils/google-click"
import { describe, expect, test } from "vitest"
import {
  channelLabel,
  clickIdTypeLabelKey,
  connectErrorKey,
  connectionStatusLabelKey,
  connectionStatusTone,
  connectSessionErrorKey,
  eventStatusLabelKey,
  eventStatusTone,
  failureStageLabelKey,
  processingStatusLabelKey,
  setupErrorKey,
  validateReasonLabelKey,
} from "@/features/integration-google-ads/lib/status"
import en from "../messages/en.json"

const resolveKey = (key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    )

const validateFailureCodes = [
  "accountNotReady",
  "needsReauth",
  "legacyUploadNotAllowed",
  "consentInvalid",
  "rejected",
]

const cases: [string, Record<string, string>, readonly string[]][] = [
  ["validate failure code", validateReasonLabelKey, validateFailureCodes],
  ["event status", eventStatusLabelKey, googleAdsEventStatusValues],
  [
    "processing status",
    processingStatusLabelKey,
    googleAdsProcessingStatusValues,
  ],
  ["failure stage", failureStageLabelKey, googleAdsFailureStageValues],
  ["click id type", clickIdTypeLabelKey, googleAdsClickIdTypeValues],
  ["connection status", connectionStatusLabelKey, connectionStatuses.options],
  ["setup error", setupErrorKey, googleAdsSetupErrorSchema.options],
  [
    "connect session error",
    connectSessionErrorKey,
    connectSessionErrorCodes.options,
  ],
  ["connect_error query code", connectErrorKey, connectErrorQueryCodes.options],
]

describe("google ads status maps", () => {
  test.each(
    cases,
  )("%s map covers every enum value with an en.json key", (_name, map, values) => {
    expect(Object.keys(map).sort()).toEqual([...values].sort())
    for (const key of Object.values(map)) {
      expect(typeof resolveKey(key), key).toBe("string")
    }
  })

  test("status tone maps cover every status", () => {
    expect(Object.keys(eventStatusTone).sort()).toEqual(
      [...googleAdsEventStatusValues].sort(),
    )
    expect(Object.keys(connectionStatusTone).sort()).toEqual(
      [...connectionStatuses.options].sort(),
    )
  })

  test("every Google Ads channel resolves to the shared inbox label", () => {
    for (const channel of GOOGLE_ADS_CHANNEL_VALUES) {
      expect(channelLabel(channel)).not.toBe(channel)
    }
    expect(channelLabel("unknown-channel")).toBe("unknown-channel")
  })
})
