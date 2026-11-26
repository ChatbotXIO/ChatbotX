import { describe, expect, test } from "vitest"
import { retryHintMs } from "../src/meta-graph-errors"
import {
  maxBucRegainMs,
  READ_USAGE_EXHAUSTED_PAUSE_MS,
  usagePauseMs,
} from "../src/meta-usage"

const headers = (values: Record<string, string>) => new Headers(values)
const buc = (entry: Record<string, number>) => ({
  "x-business-use-case-usage": JSON.stringify({ "1": [entry] }),
})

describe("usagePauseMs", () => {
  test("is null without headers or while the budget has room", () => {
    expect(usagePauseMs(undefined)).toBeNull()
    expect(usagePauseMs(headers({}))).toBeNull()
    expect(
      usagePauseMs(headers({ "x-app-usage": '{"call_count":40}' })),
    ).toBeNull()
    expect(usagePauseMs(headers(buc({ call_count: 89 })))).toBeNull()
  })

  test("uses the regain estimate of the business header, in minutes", () => {
    expect(
      usagePauseMs(
        headers(buc({ call_count: 100, estimated_time_to_regain_access: 3 })),
      ),
    ).toBe(180_000)
  })

  test("pauses a fixed time when either header reads exhausted without a regain time", () => {
    expect(usagePauseMs(headers(buc({ total_time: 92 })))).toBe(
      READ_USAGE_EXHAUSTED_PAUSE_MS,
    )
    expect(
      usagePauseMs(headers({ "x-app-usage": '{"total_cputime":90}' })),
    ).toBe(READ_USAGE_EXHAUSTED_PAUSE_MS)
  })

  test("reads every bucket and every entry, not only the first", () => {
    const header = (value: unknown) => ({
      "x-business-use-case-usage": JSON.stringify(value),
    })
    expect(
      usagePauseMs(
        headers(
          header({
            "1": [{ call_count: 5 }],
            "2": [{ estimated_time_to_regain_access: 3 }],
          }),
        ),
      ),
    ).toBe(180_000)
    expect(
      usagePauseMs(
        headers(
          header({
            "1": [
              { call_count: 5 },
              { estimated_time_to_regain_access: 2 },
              { estimated_time_to_regain_access: 4 },
            ],
          }),
        ),
      ),
    ).toBe(240_000)
    expect(
      usagePauseMs(
        headers(
          header({ "1": [{ total_time: 5 }], "2": [{ call_count: 95 }] }),
        ),
      ),
    ).toBe(READ_USAGE_EXHAUSTED_PAUSE_MS)
  })

  test.each([
    '{"1":[null]}',
    '{"1":"x"}',
    '{"1":[{"type":"x"}]}',
    "null",
    "5",
    '"x"',
    "[]",
  ])("valid JSON of another shape (%s) reads as no usage and falls back to x-app-usage", (value) => {
    const bucOnly = { "x-business-use-case-usage": value }
    expect(maxBucRegainMs(value)).toBeNull()
    expect(usagePauseMs(headers(bucOnly))).toBeNull()
    expect(
      usagePauseMs(headers({ ...bucOnly, "x-app-usage": '{"call_count":95}' })),
    ).toBe(READ_USAGE_EXHAUSTED_PAUSE_MS)
    expect(retryHintMs(headers(bucOnly), undefined)).toBeUndefined()
  })

  test.each([
    ['{"1":[{"estimated_time_to_regain_access":"3"}]}', 180_000],
    ['{"1":[null,{"estimated_time_to_regain_access":3}]}', null],
    ['{"1":[null]}', null],
  ])("maxBucRegainMs and retryHintMs keep their pre-existing outcome for %s", (value, expected) => {
    const buc = { "x-business-use-case-usage": value }
    expect(maxBucRegainMs(value)).toBe(expected)
    expect(retryHintMs(headers(buc), undefined)).toBe(expected ?? undefined)
  })

  test("a malformed header does not hide the other one's exhausted reading", () => {
    expect(
      usagePauseMs(
        headers({
          ...buc({ call_count: 95 }),
          "x-app-usage": '{"call_count":"invalid"}',
        }),
      ),
    ).toBe(READ_USAGE_EXHAUSTED_PAUSE_MS)
    expect(
      usagePauseMs(
        headers({
          "x-app-usage": '{"call_count":95}',
          "x-business-use-case-usage": '{"1":[null]}',
        }),
      ),
    ).toBe(READ_USAGE_EXHAUSTED_PAUSE_MS)
  })

  test("ignores malformed headers", () => {
    expect(
      usagePauseMs(
        headers({
          "x-app-usage": "nope",
          "x-business-use-case-usage": "nope",
        }),
      ),
    ).toBeNull()
  })
})
