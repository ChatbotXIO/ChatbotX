import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { newestGoogleClickReferralMerge } from "../src/queries/google-click"

const render = (referral: Record<string, unknown>) => {
  const query = newestGoogleClickReferralMerge(referral)
  if (!query) {
    throw new Error("expected a guarded merge")
  }
  return new PgDialect().sqlToQuery(query)
}

const GOOGLE_CLICK = {
  gclid: "gclid-1234567890",
  gbraid: null,
  googleCampaignId: "1",
  googleAdGroupId: "2",
  googleAdId: "3",
  googleClickReceivedAt: "2026-10-01T00:00:00.000Z",
}

const GUARDED_BRANCHES = /THEN \$3::jsonb ELSE \$4::jsonb END/

describe("newestGoogleClickReferralMerge", () => {
  test("returns null without a parseable googleClickReceivedAt", () => {
    expect(newestGoogleClickReferralMerge({ ctwaClid: "c" })).toBeNull()
    expect(
      newestGoogleClickReferralMerge({ googleClickReceivedAt: null }),
    ).toBeNull()
    expect(
      newestGoogleClickReferralMerge({ googleClickReceivedAt: "nope" }),
    ).toBeNull()
  })

  test.each([
    "2026-10-01",
    "2026-10-01T00:00:00Z",
    "2026-10-01T00:00:00.000+00:00",
    "2026-10-01T00:00:00.00Z",
    " 2026-10-01T00:00:00.000Z",
    "2026-10-01T00:00:00.000Z\n",
  ])("returns null for the non fixed-width ISO value %j", (value) => {
    expect(
      newestGoogleClickReferralMerge({ googleClickReceivedAt: value }),
    ).toBeNull()
  })

  test("is one parameterised expression: stored-newer branch first", () => {
    const { sql, params } = render({ ...GOOGLE_CLICK, ctwaClid: "meta-1" })
    expect(sql).toContain(`"referral"->>'googleClickReceivedAt'`)
    expect(sql).toContain('COLLATE "C" > $2::text COLLATE "C"')
    expect(sql).toMatch(GUARDED_BRANCHES)
    expect(params[1]).toBe("2026-10-01T00:00:00.000Z")
    expect(sql).not.toContain("gclid-1234567890")
  })

  test("the stale branch keeps non-Google keys and drops all six Google keys", () => {
    const { params } = render({ ...GOOGLE_CLICK, ctwaClid: "meta-1" })
    expect(JSON.parse(params[2] as string)).toEqual({ ctwaClid: "meta-1" })
  })

  test("the newer branch applies everything, including the null clearing the other id", () => {
    const { params } = render({ ...GOOGLE_CLICK, ctwaClid: "meta-1" })
    expect(JSON.parse(params[3] as string)).toEqual({
      ...GOOGLE_CLICK,
      ctwaClid: "meta-1",
    })
  })

  test("equal timestamps are not 'strictly newer', so the incoming click applies", () => {
    const { sql } = render(GOOGLE_CLICK)
    expect(sql).toContain('COLLATE "C" > ')
    expect(sql).not.toContain(">=")
  })

  test("never casts to timestamptz: the comparison is plain text", () => {
    expect(render(GOOGLE_CLICK).sql).not.toContain("timestamptz")
  })

  test("the stored value is guarded by the strict full-match format regex", () => {
    const { sql, params } = render(GOOGLE_CLICK)
    expect(sql).toContain(" ~ $1 THEN")
    expect(params[0]).toBe(
      "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$",
    )
  })
})
