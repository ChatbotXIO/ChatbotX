import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MAX_REDRIVE_GENERATIONS } from "../src/google-ads/timing"

const mocks = vi.hoisted(() => ({
  findGoogleClickAttribution: vi.fn(),
  insertIgnoreDuplicate: vi.fn(),
  findByTransactionId: vi.fn(),
  redrive: vi.fn(),
  getSetup: vi.fn(),
  enqueueSend: vi.fn(),
  isSendJobLive: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findGoogleClickAttribution: mocks.findGoogleClickAttribution,
  },
  googleAdsConversionEventRepository: {
    insertIgnoreDuplicate: mocks.insertIgnoreDuplicate,
    findByTransactionId: mocks.findByTransactionId,
    redrive: mocks.redrive,
  },
}))
vi.mock("../src/integration-google-ads/service", () => ({
  integrationGoogleAdsService: { getSetup: mocks.getSetup },
}))
vi.mock("../src/google-ads/send-queue", () => ({
  enqueueSend: mocks.enqueueSend,
  isSendJobLive: mocks.isSendJobLive,
}))

const { recordGoogleAdsConversion } = await import(
  "../src/google-ads/record-conversion"
)

const HOUR = 60 * 60 * 1000
const CLICK_AT = new Date(Date.now() - 48 * HOUR)

const action = (overrides: Record<string, unknown> = {}) => ({
  id: "999",
  name: "Purchase",
  category: "PURCHASE",
  status: "ENABLED",
  clickThroughLookbackWindowDays: 30,
  ...overrides,
})

const readySetup = (actions = [action()]) => ({
  readiness: "ready",
  integration: {
    id: "int-1",
    customerId: "1112223333",
    loginCustomerId: "4445556666",
    conversionCustomerId: "7778889999",
    conversionActions: actions,
  },
})

const attribution = (referral: Record<string, unknown> | null = {}) => ({
  channel: "messenger",
  referral: {
    gclid: "GCLID-SECRET",
    googleClickReceivedAt: CLICK_AT.toISOString(),
    ...referral,
  },
})

const NOT_PROVIDED = {
  adUserData: { status: null, source: "notProvided" as const },
  adPersonalization: { status: null, source: "notProvided" as const },
}

const input = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: "ws-1",
  contactInboxId: "ci-1",
  source: "flowStep" as const,
  scopeId: "step-1",
  conversionActionId: "999",
  recordedAt: new Date(),
  dedupMode: "id" as const,
  dedupId: "ord-1",
  consent: NOT_PROVIDED,
  ...overrides,
})

const sha = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32)

/** `ws-1` + the setup's conversion customer. */
const NAMESPACE = "ws-1:7778889999"
const idTransactionId = (id: string, action = "999") =>
  `gads-v2-${action}-i-${sha(`${NAMESPACE}:${id}`)}`
const clickTransactionId = (clickId: string, action = "999") =>
  `gads-v2-${action}-c-${sha(`${NAMESPACE}:${clickId}`)}`

const lastInsert = () => mocks.insertIgnoreDuplicate.mock.calls.at(-1)?.[0]

const storedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  workspaceId: "ws-1",
  status: "pending",
  attempt: 0,
  claimToken: null,
  googleClickReceivedAt: CLICK_AT,
  ...overrides,
})

const ANY_SHA256_DIGEST = /[0-9a-f]{64}/
const EVENT_TRANSACTION_ID = /^gads-v2-.+-e-[0-9a-f]{32}$/

describe("recordGoogleAdsConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findGoogleClickAttribution.mockResolvedValue(attribution())
    mocks.getSetup.mockResolvedValue(readySetup())
    mocks.insertIgnoreDuplicate.mockResolvedValue(storedEvent())
    mocks.isSendJobLive.mockResolvedValue(false)
  })

  test("queues a new event and enqueues generation 0 with the click-age delay", async () => {
    const result = await recordGoogleAdsConversion(input())

    expect(result).toEqual({ status: "queued", event: storedEvent() })
    expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
    const [event, attempt, delay] = mocks.enqueueSend.mock.calls[0]
    expect(event).toEqual(storedEvent())
    expect(attempt).toBe(0)
    expect(delay).toBe(0)
  })

  test("delays a fresh click until it is 6h old", async () => {
    const received = new Date(Date.now() - HOUR)
    mocks.findGoogleClickAttribution.mockResolvedValue(
      attribution({ googleClickReceivedAt: received.toISOString() }),
    )
    await recordGoogleAdsConversion(input())

    const delay = mocks.enqueueSend.mock.calls[0][2] as number
    expect(delay).toBeGreaterThan(4.9 * HOUR)
    expect(delay).toBeLessThanOrEqual(5 * HOUR)
  })

  test("snapshots the account, action and click onto the row", async () => {
    await recordGoogleAdsConversion(input())

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        integrationGoogleAdsId: "int-1",
        contactInboxId: "ci-1",
        customerId: "1112223333",
        loginCustomerId: "4445556666",
        conversionCustomerId: "7778889999",
        conversionActionId: "999",
        conversionActionName: "Purchase",
        conversionActionCategory: "PURCHASE",
        lookbackWindowDays: 30,
        channel: "messenger",
        source: "flowStep",
        scopeId: "step-1",
        clickIdType: "gclid",
        clickId: "GCLID-SECRET",
        googleClickReceivedAt: CLICK_AT,
        transactionId: idTransactionId("ord-1"),
        status: "pending",
        attempt: 0,
        processingAttempts: 0,
      }),
    )
  })

  test("pins the transport: a connection without a method records dataManager", async () => {
    await recordGoogleAdsConversion(input())

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ uploadMethod: "dataManager" }),
    )
  })

  test.each([
    ["legacy", "legacy"],
    ["dataManager", "dataManager"],
    ["garbage", "dataManager"],
  ])("records the connection's method %s as %s", async (stored, expected) => {
    const setup = readySetup()
    mocks.getSetup.mockResolvedValue({
      ...setup,
      integration: {
        ...setup.integration,
        auth: { metadata: { uploadMethod: stored } },
      },
    })

    await recordGoogleAdsConversion(input())

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ uploadMethod: expected }),
    )
  })

  describe("customer matching snapshot", () => {
    const GRANTED = {
      adUserData: { status: "granted", source: "fixed" },
      adPersonalization: { status: null, source: "notProvided" },
    }
    const setupWith = (uploadMethod: string) => {
      const setup = readySetup()
      mocks.getSetup.mockResolvedValue({
        ...setup,
        integration: {
          ...setup.integration,
          auth: { metadata: { uploadMethod } },
        },
      })
    }

    test("nothing configured keeps the exact v1 snapshot", async () => {
      await recordGoogleAdsConversion(
        input({ consent: GRANTED, matchEmail: "", matchPhone: "  " }),
      )

      expect(lastInsert().options.version).toBe(1)
      expect(lastInsert().options).not.toHaveProperty("matching")
    })

    test("configured, granted and Data Manager records a v2 snapshot with the sources only", async () => {
      await recordGoogleAdsConversion(
        input({
          consent: GRANTED,
          matchEmail: "{{email}}",
          matchPhone: "{{phone}}",
        }),
      )

      expect(lastInsert().options).toMatchObject({
        version: 2,
        matching: { status: "enabled", email: "{{email}}", phone: "{{phone}}" },
      })
    })

    test("no identifier or hash ever reaches the stored row", async () => {
      await recordGoogleAdsConversion(
        input({ consent: GRANTED, matchEmail: "{{email}}" }),
      )

      const stored = JSON.stringify(lastInsert())
      expect(stored).not.toMatch(ANY_SHA256_DIGEST)
      expect(stored).not.toContain("@")
    })

    test.each([
      ["not provided", NOT_PROVIDED],
      [
        "denied",
        {
          adUserData: { status: "denied", source: "fixed" },
          adPersonalization: { status: null, source: "notProvided" },
        },
      ],
    ])("ad user data %s is recorded as withheldConsent", async (_label, consent) => {
      await recordGoogleAdsConversion(
        input({ consent, matchEmail: "{{email}}" }),
      )

      expect(lastInsert().options.matching.status).toBe("withheldConsent")
    })

    test("a legacy connection records unsupportedTransport, whatever the consent", async () => {
      setupWith("legacy")

      await recordGoogleAdsConversion(
        input({ consent: GRANTED, matchPhone: "{{phone}}" }),
      )

      expect(lastInsert().options.matching).toEqual({
        status: "unsupportedTransport",
        email: null,
        phone: "{{phone}}",
      })
    })

    test("matching never changes the provider id", async () => {
      await recordGoogleAdsConversion(input({ dedupId: "ord-1" }))
      const withoutMatching = lastInsert().transactionId
      await recordGoogleAdsConversion(
        input({ dedupId: "ord-1", consent: GRANTED, matchEmail: "{{email}}" }),
      )

      expect(lastInsert().transactionId).toBe(withoutMatching)
    })
  })

  describe("customer properties snapshot", () => {
    const GRANTED = {
      adUserData: { status: "granted", source: "fixed" },
      adPersonalization: { status: null, source: "notProvided" },
    }

    test("nothing set keeps the exact v1 snapshot", async () => {
      await recordGoogleAdsConversion(
        input({ consent: GRANTED, customerType: "", customerValueBucket: " " }),
      )

      expect(lastInsert().options.version).toBe(1)
      expect(lastInsert().options).not.toHaveProperty("customerProperties")
    })

    test("granted on Data Manager records the resolved values in a v2 snapshot", async () => {
      await recordGoogleAdsConversion(
        input({
          consent: GRANTED,
          customerType: "new",
          customerValueBucket: "High",
        }),
      )

      expect(lastInsert().options).toMatchObject({
        version: 2,
        customerProperties: {
          status: "enabled",
          customerType: "NEW",
          customerValueBucket: "HIGH",
        },
      })
    })

    test("an unresolved variable is the same as not set", async () => {
      await recordGoogleAdsConversion(
        input({ consent: GRANTED, customerType: "{{contact.type}}" }),
      )

      expect(lastInsert().options.version).toBe(1)
    })

    test("ad user data not provided is recorded as withheldConsent", async () => {
      await recordGoogleAdsConversion(
        input({ consent: NOT_PROVIDED, customerType: "RETURNING" }),
      )

      expect(lastInsert().options.customerProperties.status).toBe(
        "withheldConsent",
      )
    })

    test("a value outside the allowed ones records nothing", async () => {
      const result = await recordGoogleAdsConversion(
        input({ consent: GRANTED, customerType: "VIP" }),
      )

      expect(result).toEqual({ status: "invalidCustomerProperty" })
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    })

    test("properties never change the provider id", async () => {
      await recordGoogleAdsConversion(input({ dedupId: "ord-1" }))
      const without = lastInsert().transactionId
      await recordGoogleAdsConversion(
        input({ dedupId: "ord-1", consent: GRANTED, customerType: "NEW" }),
      )

      expect(lastInsert().transactionId).toBe(without)
    })
  })

  test("uses gbraid when no gclid is stored", async () => {
    mocks.findGoogleClickAttribution.mockResolvedValue(
      attribution({ gclid: null, gbraid: "GBRAID" }),
    )
    await recordGoogleAdsConversion(input())

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ clickIdType: "gbraid", clickId: "GBRAID" }),
    )
  })

  test("stores a back-dated recordedAt as given: no clamp to the click receipt", async () => {
    const recordedAt = new Date(CLICK_AT.getTime() - HOUR)
    await recordGoogleAdsConversion(input({ recordedAt }))

    expect(lastInsert().occurredAt).toEqual(recordedAt)
  })

  test("keeps occurredAt when it is after the click", async () => {
    const recordedAt = new Date(CLICK_AT.getTime() + HOUR)
    await recordGoogleAdsConversion(input({ recordedAt }))

    expect(lastInsert().occurredAt).toEqual(recordedAt)
  })

  test("a provided conversion time becomes occurredAt and marks the time source", async () => {
    await recordGoogleAdsConversion(
      input({ conversionTime: "2026-10-01T14:30:00+07:00" }),
    )

    expect(lastInsert().occurredAt).toEqual(new Date("2026-10-01T07:30:00Z"))
    expect(lastInsert().options.timeSource).toBe("provided")
  })

  test("a blank conversion time uses the recorded clock", async () => {
    const recordedAt = new Date()
    await recordGoogleAdsConversion(input({ recordedAt, conversionTime: "  " }))

    expect(lastInsert().occurredAt).toEqual(recordedAt)
    expect(lastInsert().options.timeSource).toBe("recorded")
  })

  test("stores value and currency together", async () => {
    await recordGoogleAdsConversion(input({ value: "19.99", currency: "USD" }))
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ value: "19.99", currency: "USD" }),
    )
  })

  test("stores null value and currency when neither is given", async () => {
    await recordGoogleAdsConversion(input())
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ value: null, currency: null }),
    )
  })

  test("rejects a value without a currency before touching the database", async () => {
    expect(await recordGoogleAdsConversion(input({ value: "5" }))).toEqual({
      status: "invalidValue",
    })
    expect(await recordGoogleAdsConversion(input({ currency: "USD" }))).toEqual(
      { status: "invalidValue" },
    )
    expect(mocks.findGoogleClickAttribution).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("rejects a malformed value", async () => {
    expect(
      await recordGoogleAdsConversion(
        input({ value: "not-a-number", currency: "USD" }),
      ),
    ).toEqual({ status: "invalidValue" })
  })

  test.each([
    ["no attribution row", null],
    ["no referral", { channel: "messenger", referral: null }],
    ["no click id", attribution({ gclid: null, gbraid: null })],
    ["no capture time", attribution({ googleClickReceivedAt: null })],
    ["an invalid capture time", attribution({ googleClickReceivedAt: "nope" })],
  ])("returns noClick for %s", async (_name, row) => {
    mocks.findGoogleClickAttribution.mockResolvedValue(row)
    expect(await recordGoogleAdsConversion(input())).toEqual({
      status: "noClick",
    })
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test.each([
    "email",
    "telegram",
    "instagram",
  ])("returns unsupportedChannel for the %s channel", async (channel) => {
    mocks.findGoogleClickAttribution.mockResolvedValue({
      ...attribution(),
      channel,
    })
    expect(await recordGoogleAdsConversion(input())).toEqual({
      status: "unsupportedChannel",
    })
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test.each([
    ["no integration", null],
    ["needs_reauth", { ...readySetup(), readiness: "needs_reauth" }],
    ["setup_incomplete", { ...readySetup(), readiness: "setup_incomplete" }],
    [
      "no conversion customer",
      {
        ...readySetup(),
        integration: {
          ...readySetup().integration,
          conversionCustomerId: null,
        },
      },
    ],
  ])("returns noAccount for %s", async (_name, setup) => {
    mocks.getSetup.mockResolvedValue(setup)
    expect(await recordGoogleAdsConversion(input())).toEqual({
      status: "noAccount",
    })
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("returns unknownConversionAction when the action is not synced", async () => {
    expect(
      await recordGoogleAdsConversion(input({ conversionActionId: "12345" })),
    ).toEqual({ status: "unknownConversionAction" })
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("returns actionDisabled for a non-ENABLED action", async () => {
    mocks.getSetup.mockResolvedValue(
      readySetup([action({ status: "REMOVED" })]),
    )
    expect(await recordGoogleAdsConversion(input())).toEqual({
      status: "actionDisabled",
    })
  })

  // https://developers.google.com/data-manager/api/reference/rest/v1/requestStatus/retrieve#ProcessingErrorReason
  // PROCESSING_ERROR_REASON_ONE_PER_CLICK_CONVERSION_ACTION_NOT_PERMITTED_WITH_BRAID
  describe("gbraid needs a MANY_PER_CLICK action", () => {
    const gbraid = () => attribution({ gclid: null, gbraid: "GBRAID" })

    test("rejects a gbraid click on a ONE_PER_CLICK action without writing a row", async () => {
      mocks.findGoogleClickAttribution.mockResolvedValue(gbraid())
      mocks.getSetup.mockResolvedValue(
        readySetup([action({ countingType: "ONE_PER_CLICK" })]),
      )

      expect(await recordGoogleAdsConversion(input())).toEqual({
        status: "incompatibleAction",
      })
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
    })

    test.each([
      "click",
      "id",
    ] as const)("the guard applies in %s mode", async (dedupMode) => {
      mocks.findGoogleClickAttribution.mockResolvedValue(gbraid())
      mocks.getSetup.mockResolvedValue(
        readySetup([action({ countingType: "ONE_PER_CLICK" })]),
      )

      expect(await recordGoogleAdsConversion(input({ dedupMode }))).toEqual({
        status: "incompatibleAction",
      })
    })

    test("accepts a gbraid click on a MANY_PER_CLICK action", async () => {
      mocks.findGoogleClickAttribution.mockResolvedValue(gbraid())
      mocks.getSetup.mockResolvedValue(
        readySetup([action({ countingType: "MANY_PER_CLICK" })]),
      )

      expect(await recordGoogleAdsConversion(input())).toMatchObject({
        status: "queued",
      })
    })

    test("keeps ONE_PER_CLICK usable for a gclid", async () => {
      mocks.getSetup.mockResolvedValue(
        readySetup([action({ countingType: "ONE_PER_CLICK" })]),
      )

      expect(await recordGoogleAdsConversion(input())).toMatchObject({
        status: "queued",
      })
    })

    test("a cached action without a counting type is not blocked", async () => {
      mocks.findGoogleClickAttribution.mockResolvedValue(gbraid())

      expect(await recordGoogleAdsConversion(input())).toMatchObject({
        status: "queued",
      })
    })
  })

  // PROCESSING_ERROR_REASON_EXTERNAL_ATTRIBUTION_DATA_MISSING
  describe("external-attribution actions", () => {
    test("are refused as unsupportedAction without writing a row", async () => {
      mocks.getSetup.mockResolvedValue(
        readySetup([action({ attributionModel: "EXTERNAL" })]),
      )

      expect(await recordGoogleAdsConversion(input())).toEqual({
        status: "unsupportedAction",
      })
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    })

    test.each([
      ["a Google attribution model", "GOOGLE_ADS_LAST_CLICK"],
      ["no recorded model (older cache)", undefined],
      ["a null model", null],
    ])("still accepts %s", async (_name, attributionModel) => {
      mocks.getSetup.mockResolvedValue(
        readySetup([action({ attributionModel })]),
      )

      expect(await recordGoogleAdsConversion(input())).toMatchObject({
        status: "queued",
      })
    })

    test("a disabled external action reports actionDisabled first", async () => {
      mocks.getSetup.mockResolvedValue(
        readySetup([
          action({ attributionModel: "EXTERNAL", status: "REMOVED" }),
        ]),
      )

      expect(await recordGoogleAdsConversion(input())).toEqual({
        status: "actionDisabled",
      })
    })
  })

  describe("identity (dedup mode and ID)", () => {
    test("id mode: the resolved ID builds the provider id and the snapshot", async () => {
      await recordGoogleAdsConversion(input({ dedupId: "A-1042" }))

      expect(lastInsert().transactionId).toBe(idTransactionId("A-1042"))
      expect(lastInsert().options.identity).toEqual({
        version: 1,
        configuredPolicy: "id",
        effectivePolicy: "id",
        keySource: "explicit",
        id: "A-1042",
      })
    })

    test("click mode: one per click and action, a provided ID is ignored and not stored", async () => {
      await recordGoogleAdsConversion(
        input({ dedupMode: "click", dedupId: "ignored-9" }),
      )

      expect(lastInsert().transactionId).toBe(
        clickTransactionId("GCLID-SECRET"),
      )
      expect(lastInsert().options.identity).toEqual({
        version: 1,
        configuredPolicy: "click",
        effectivePolicy: "click",
        keySource: "click",
        id: null,
      })
      expect(JSON.stringify(lastInsert())).not.toContain("ignored-9")
    })

    test("trims the ID so 'A1 ' and 'A1' share one provider id", async () => {
      await recordGoogleAdsConversion(input({ dedupId: "A1 " }))
      await recordGoogleAdsConversion(input({ dedupId: "A1" }))

      const [first, second] = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row,
      )
      expect(first.options.identity.id).toBe("A1")
      expect(first.transactionId).toBe(second.transactionId)
    })

    test("the same ID from two steps, triggers or inboxes is one identity", async () => {
      await recordGoogleAdsConversion(input({ scopeId: "step-1" }))
      await recordGoogleAdsConversion(
        input({ scopeId: "trigger-7", source: "triggerAction" }),
      )

      const [first, second] = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row,
      )
      expect(first.transactionId).toBe(second.transactionId)
    })

    test("distinct IDs are distinct events; the same ID on two actions is two", async () => {
      mocks.getSetup.mockResolvedValue(
        readySetup([action(), action({ id: "888", name: "Other" })]),
      )
      await recordGoogleAdsConversion(input({ dedupId: "A-1" }))
      await recordGoogleAdsConversion(input({ dedupId: "A-2" }))
      await recordGoogleAdsConversion(
        input({ dedupId: "A-1", conversionActionId: "888" }),
      )

      const ids = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row.transactionId,
      )
      expect(new Set(ids).size).toBe(3)
    })

    test("the same ID in two workspaces differs; the same workspace and account is stable", async () => {
      await recordGoogleAdsConversion(input({ workspaceId: "ws-1" }))
      await recordGoogleAdsConversion(input({ workspaceId: "ws-2" }))
      await recordGoogleAdsConversion(input({ workspaceId: "ws-1" }))

      const [a, b, c] = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row.transactionId,
      )
      expect(a).not.toBe(b)
      expect(a).toBe(c)
    })

    test("switching the Google Ads account changes the provider id for the same ID", async () => {
      await recordGoogleAdsConversion(input())
      const setup = readySetup()
      mocks.getSetup.mockResolvedValue({
        ...setup,
        integration: {
          ...setup.integration,
          conversionCustomerId: "1010101010",
        },
      })
      await recordGoogleAdsConversion(input())

      const [before, after] = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row.transactionId,
      )
      expect(before).not.toBe(after)
    })

    test("the same ID from a different click is the same identity (first click kept)", async () => {
      await recordGoogleAdsConversion(input())
      mocks.findGoogleClickAttribution.mockResolvedValue(
        attribution({ gclid: "OTHER-CLICK-1" }),
      )
      await recordGoogleAdsConversion(input())

      const [first, second] = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row.transactionId,
      )
      expect(first).toBe(second)
    })

    test("click mode differs per click", async () => {
      await recordGoogleAdsConversion(input({ dedupMode: "click" }))
      mocks.findGoogleClickAttribution.mockResolvedValue(
        attribution({ gclid: "OTHER-CLICK-1" }),
      )
      await recordGoogleAdsConversion(input({ dedupMode: "click" }))

      const [first, second] = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row.transactionId,
      )
      expect(first).not.toBe(second)
    })

    test("a lead action overridden to id mode counts per ID; a non-lead overridden to click per click", async () => {
      mocks.getSetup.mockResolvedValue(
        readySetup([action({ category: "SUBMIT_LEAD_FORM" })]),
      )
      await recordGoogleAdsConversion(input({ dedupId: "lead-1" }))
      await recordGoogleAdsConversion(input({ dedupId: "lead-2" }))
      mocks.getSetup.mockResolvedValue(readySetup())
      await recordGoogleAdsConversion(input({ dedupMode: "click" }))
      await recordGoogleAdsConversion(input({ dedupMode: "click" }))

      const ids = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row.transactionId,
      )
      expect(ids[0]).not.toBe(ids[1])
      expect(ids[2]).toBe(ids[3])
    })

    test("conversion time never changes the provider id (back-dated replay)", async () => {
      await recordGoogleAdsConversion(input())
      await recordGoogleAdsConversion(
        input({ conversionTime: "2026-01-01T00:00:00Z" }),
      )
      await recordGoogleAdsConversion(
        input({ dedupMode: "click", conversionTime: "2026-01-02T00:00:00Z" }),
      )
      await recordGoogleAdsConversion(input({ dedupMode: "click" }))

      const ids = mocks.insertIgnoreDuplicate.mock.calls.map(
        ([row]) => row.transactionId,
      )
      expect(ids[0]).toBe(ids[1])
      expect(ids[2]).toBe(ids[3])
    })

    test.each([
      ["missing", undefined],
      ["blank", "   "],
      ["empty", ""],
      ["an unresolved template", "{{order_number}}"],
      ["an unresolved template inside text", "A-{{order_number}}"],
    ])("id mode with %s ID is missingDedupId and writes nothing", async (_name, dedupId) => {
      expect(await recordGoogleAdsConversion(input({ dedupId }))).toEqual({
        status: "missingDedupId",
      })
      expect(mocks.findGoogleClickAttribution).not.toHaveBeenCalled()
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
    })

    test("a 65-character ID is invalidDedupId; 64 is accepted", async () => {
      expect(
        await recordGoogleAdsConversion(input({ dedupId: "x".repeat(65) })),
      ).toEqual({ status: "invalidDedupId" })
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
      expect(
        await recordGoogleAdsConversion(input({ dedupId: "x".repeat(64) })),
      ).toMatchObject({ status: "queued" })
    })

    test("click mode needs no ID", async () => {
      expect(
        await recordGoogleAdsConversion(
          input({ dedupMode: "click", dedupId: undefined }),
        ),
      ).toMatchObject({ status: "queued" })
    })

    test("event mode: every distinct occurrence key is its own conversion", async () => {
      await recordGoogleAdsConversion(
        input({ dedupMode: "event", occurrenceKey: "flow:job-1:ci-1:s-1" }),
      )
      const first = lastInsert()
      await recordGoogleAdsConversion(
        input({ dedupMode: "event", occurrenceKey: "flow:job-2:ci-1:s-1" }),
      )

      expect(first.transactionId).not.toBe(lastInsert().transactionId)
      expect(first.transactionId).toMatch(EVENT_TRANSACTION_ID)
    })

    test("event mode: a retry with the same key is the same provider id", async () => {
      await recordGoogleAdsConversion(
        input({ dedupMode: "event", occurrenceKey: "flow:job-1:ci-1:s-1" }),
      )
      const first = lastInsert().transactionId
      await recordGoogleAdsConversion(
        input({ dedupMode: "event", occurrenceKey: "flow:job-1:ci-1:s-1" }),
      )

      expect(lastInsert().transactionId).toBe(first)
    })

    test("event mode: the snapshot names the policy and never stores the key", async () => {
      await recordGoogleAdsConversion(
        input({
          dedupMode: "event",
          occurrenceKey: "flow:secret-key:ci-1:s-1",
        }),
      )

      expect(lastInsert().options.identity).toEqual({
        version: 1,
        configuredPolicy: "event",
        effectivePolicy: "event",
        keySource: "occurrence",
        id: null,
      })
      expect(JSON.stringify(lastInsert())).not.toContain("secret-key")
    })

    test("event mode: a click does not change the id; a provided dedup ID is ignored", async () => {
      await recordGoogleAdsConversion(
        input({
          dedupMode: "event",
          occurrenceKey: "k-1",
          dedupId: "ignored-9",
        }),
      )

      expect(JSON.stringify(lastInsert())).not.toContain("ignored-9")
    })

    test.each([
      undefined,
      "",
      "   ",
    ])("event mode without a usable key (%j) is missingOccurrenceKey and writes nothing", async (occurrenceKey) => {
      expect(
        await recordGoogleAdsConversion(
          input({ dedupMode: "event", occurrenceKey }),
        ),
      ).toEqual({ status: "missingOccurrenceKey" })
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    })

    test("click and id modes ignore an occurrence key", async () => {
      await recordGoogleAdsConversion(
        input({ dedupMode: "click", occurrenceKey: "k-1" }),
      )

      expect(lastInsert().transactionId).toBe(
        clickTransactionId("GCLID-SECRET"),
      )
    })

    test("there is no fallback identity: nothing is derived from message or job ids", async () => {
      await recordGoogleAdsConversion(
        input({ dedupId: undefined, triggerMessageId: "msg-1" }),
      )

      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    })
  })

  describe("conversion time and the two clocks", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    test.each([
      ["no zone", "2026-10-08T14:30:00"],
      ["a date only", "2026-10-08"],
      ["a non-existent date", "2026-02-30T10:00:00Z"],
      ["an unresolved template", "{{closed_at}}"],
    ])("%s is invalidConversionTime malformed", async (_name, conversionTime) => {
      expect(
        await recordGoogleAdsConversion(input({ conversionTime })),
      ).toEqual({ status: "invalidConversionTime", reason: "malformed" })
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    })

    test("a future time is invalidConversionTime future", async () => {
      expect(
        await recordGoogleAdsConversion(
          input({ conversionTime: "2999-01-01T00:00:00Z" }),
        ),
      ).toEqual({ status: "invalidConversionTime", reason: "future" })
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    })

    test("validationNow is read in record, after resolution: a time between recordedAt and now is accepted", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-10-08T10:00:10Z"))
      const recordedAt = new Date("2026-10-08T10:00:00Z")

      const result = await recordGoogleAdsConversion(
        input({ recordedAt, conversionTime: "2026-10-08T10:00:05Z" }),
      )

      expect(result).toMatchObject({ status: "queued" })
      expect(lastInsert().occurredAt).toEqual(new Date("2026-10-08T10:00:05Z"))
    })

    test("a time equal to validationNow is not the future", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-10-08T10:00:10Z"))

      expect(
        await recordGoogleAdsConversion(
          input({ conversionTime: "2026-10-08T10:00:10Z" }),
        ),
      ).toMatchObject({ status: "queued" })
    })

    test("no receipt margin: a time long before the click is stored, not refused", async () => {
      await recordGoogleAdsConversion(
        input({ conversionTime: "2020-01-01T00:00:00Z" }),
      )

      expect(lastInsert().occurredAt).toEqual(new Date("2020-01-01T00:00:00Z"))
    })

    test("the first delay uses the click receipt and now, not the back-dated time", async () => {
      const received = new Date(Date.now() - HOUR)
      mocks.findGoogleClickAttribution.mockResolvedValue(
        attribution({ googleClickReceivedAt: received.toISOString() }),
      )

      await recordGoogleAdsConversion(
        input({ conversionTime: "2020-01-01T00:00:00Z" }),
      )

      const delay = mocks.enqueueSend.mock.calls[0][2] as number
      expect(delay).toBeGreaterThan(4.9 * HOUR)
      expect(delay).toBeLessThanOrEqual(5 * HOUR)
    })
  })

  describe("options snapshot", () => {
    test("copies the consent input verbatim and never stores templates or raw text", async () => {
      const consent = {
        adUserData: { status: "granted" as const, source: "variable" as const },
        adPersonalization: { status: null, source: "variable" as const },
      }
      await recordGoogleAdsConversion(input({ consent }))

      expect(lastInsert().options).toEqual({
        version: 1,
        identity: expect.objectContaining({ keySource: "explicit" }),
        timeSource: "recorded",
        consent,
      })
    })

    test("unknown keys on the consent input (e.g. a raw value) are not stored", async () => {
      const consent = {
        adUserData: {
          status: "granted" as const,
          source: "variable" as const,
          raw: "Granted",
        },
        adPersonalization: { status: null, source: "notProvided" as const },
      }
      await recordGoogleAdsConversion(input({ consent }))

      expect(JSON.stringify(lastInsert().options)).not.toContain("Granted")
    })

    test("a malformed consent input is a programmer error and writes nothing", async () => {
      const consent = {
        adUserData: { status: "yes", source: "fixed" },
        adPersonalization: { status: null, source: "notProvided" },
      } as unknown as Parameters<typeof input>[0]["consent"]

      await expect(
        recordGoogleAdsConversion(input({ consent })),
      ).rejects.toThrow()
      expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    })

    test("a replay keeps the first snapshot: the duplicate insert is ignored", async () => {
      mocks.insertIgnoreDuplicate.mockResolvedValueOnce(storedEvent())
      mocks.insertIgnoreDuplicate.mockResolvedValueOnce(null)
      mocks.findByTransactionId.mockResolvedValue(storedEvent())
      mocks.isSendJobLive.mockResolvedValue(true)

      await recordGoogleAdsConversion(input())
      const replay = await recordGoogleAdsConversion(
        input({
          consent: {
            adUserData: { status: "denied", source: "fixed" },
            adPersonalization: { status: null, source: "notProvided" },
          },
        }),
      )

      expect(replay).toEqual({ status: "queued", event: storedEvent() })
      expect(mocks.redrive).not.toHaveBeenCalled()
    })
  })

  describe("resolved input normalisation", () => {
    test("blank value and currency become null", async () => {
      await recordGoogleAdsConversion(input({ value: "", currency: " " }))

      expect(lastInsert()).toEqual(
        expect.objectContaining({ value: null, currency: null }),
      )
    })
  })

  describe("failure sanitisation", () => {
    test("an insert error echoing the click id is rethrown without it", async () => {
      mocks.insertIgnoreDuplicate.mockRejectedValue(
        new Error('insert failed, params: "GCLID-SECRET"'),
      )

      const error = await recordGoogleAdsConversion(input()).catch(
        (caught: unknown) => caught,
      )

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).not.toContain("GCLID-SECRET")
    })

    test("an enqueue error echoing the click id is rethrown without it", async () => {
      mocks.enqueueSend.mockRejectedValueOnce(
        new Error("queue down GCLID-SECRET"),
      )

      const error = await recordGoogleAdsConversion(input()).catch(
        (caught: unknown) => caught,
      )

      expect((error as Error).message).not.toContain("GCLID-SECRET")
    })
  })

  describe("dedup (insertIgnoreDuplicate returns nothing)", () => {
    beforeEach(() => {
      mocks.insertIgnoreDuplicate.mockResolvedValue(null)
    })

    test("returns the existing event without enqueueing when its job is live", async () => {
      mocks.findByTransactionId.mockResolvedValue(storedEvent())
      mocks.isSendJobLive.mockResolvedValue(true)

      const result = await recordGoogleAdsConversion(input())

      expect(result).toEqual({ status: "queued", event: storedEvent() })
      expect(mocks.findByTransactionId).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        transactionId: idTransactionId("ord-1"),
      })
      expect(mocks.redrive).not.toHaveBeenCalled()
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
    })

    test("redrives a pending, unclaimed event whose job is gone", async () => {
      const existing = storedEvent({ attempt: 2 })
      const redriven = storedEvent({ attempt: 3 })
      mocks.findByTransactionId.mockResolvedValue(existing)
      mocks.redrive.mockResolvedValue(redriven)

      const result = await recordGoogleAdsConversion(input())

      expect(mocks.isSendJobLive).toHaveBeenCalledWith("evt-1", 2)
      expect(mocks.redrive).toHaveBeenCalledWith({
        id: "evt-1",
        workspaceId: "ws-1",
        fromStatuses: ["pending"],
        expectedAttempt: 2,
      })
      expect(mocks.enqueueSend).toHaveBeenCalledWith(redriven, 3, 0)
      expect(result).toEqual({ status: "queued", event: existing })
    })

    test("does not enqueue when the redrive lost the race", async () => {
      mocks.findByTransactionId.mockResolvedValue(storedEvent())
      mocks.redrive.mockResolvedValue(null)
      await recordGoogleAdsConversion(input())
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
    })

    test.each([
      "sending",
      "sent",
      "failed",
      "processed",
    ])("never redrives a %s event", async (status) => {
      mocks.findByTransactionId.mockResolvedValue(storedEvent({ status }))
      const result = await recordGoogleAdsConversion(input())
      expect(result.status).toBe("queued")
      expect(mocks.isSendJobLive).not.toHaveBeenCalled()
      expect(mocks.redrive).not.toHaveBeenCalled()
    })

    test("never redrives a claimed pending event", async () => {
      mocks.findByTransactionId.mockResolvedValue(
        storedEvent({ claimToken: "tok" }),
      )
      await recordGoogleAdsConversion(input())
      expect(mocks.redrive).not.toHaveBeenCalled()
    })

    test("skips recovery once the redrive generation cap is reached", async () => {
      mocks.findByTransactionId.mockResolvedValue(
        storedEvent({ attempt: MAX_REDRIVE_GENERATIONS }),
      )
      const result = await recordGoogleAdsConversion(input())
      expect(result.status).toBe("queued")
      expect(mocks.isSendJobLive).not.toHaveBeenCalled()
      expect(mocks.redrive).not.toHaveBeenCalled()
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
    })

    test("falls back to noClick if the duplicate row cannot be found", async () => {
      mocks.findByTransactionId.mockResolvedValue(undefined)
      expect(await recordGoogleAdsConversion(input())).toEqual({
        status: "noClick",
      })
    })
  })
})
