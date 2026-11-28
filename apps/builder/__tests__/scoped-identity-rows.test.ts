import { describe, expect, test } from "vitest"
import type { ContactInboxResource } from "@/features/contact-inboxes/schema/resource"
import {
  buildScopedIdentityFields,
  formatCount,
  formatYesNo,
  UNKNOWN_VALUE_PLACEHOLDER,
} from "@/features/contacts/lib/scoped-identity-rows"

const t = (key: string) => key
const formatNumber = (value: number) => `#${value}`
const context = { t, formatNumber }

const buildInbox = (
  overrides: Partial<ContactInboxResource>,
): ContactInboxResource => ({
  id: "ci-1",
  contactId: "c-1",
  inboxId: "i-1",
  channel: "instagram",
  source: "inboundMessage",
  sourceId: "igsid",
  language: null,
  lastIncomingMessageAt: null,
  contactLastReadAt: null,
  inbox: { name: "IG" },
  ...overrides,
})

const valuesByKey = (inbox: ContactInboxResource) =>
  Object.fromEntries(
    buildScopedIdentityFields(inbox, context).map((row) => [
      row.key,
      row.value,
    ]),
  )

describe("formatters", () => {
  test("formatYesNo keeps false as a real answer and null as unknown", () => {
    expect(formatYesNo(true, context)).toBe("fields.channelProfile.yes")
    expect(formatYesNo(false, context)).toBe("fields.channelProfile.no")
    expect(formatYesNo(null, context)).toBeNull()
    expect(formatYesNo(undefined, context)).toBeNull()
  })

  test("formatCount keeps 0 as a real count and null as unknown", () => {
    expect(formatCount(0, context)).toBe("#0")
    expect(formatCount(42, context)).toBe("#42")
    expect(formatCount(1234, context)).toBe("#1234")
    expect(formatCount(null, context)).toBeNull()
    expect(formatCount(undefined, context)).toBeNull()
  })
})

describe("buildScopedIdentityFields", () => {
  test("instagram shows a dash for unknown (null) values", () => {
    expect(
      valuesByKey(buildInbox({ followsBusiness: null, followerCount: null })),
    ).toEqual({
      followsBusiness: UNKNOWN_VALUE_PLACEHOLDER,
      followerCount: UNKNOWN_VALUE_PLACEHOLDER,
    })
  })

  test("instagram treats keys missing from an old payload as unknown", () => {
    expect(valuesByKey(buildInbox({}))).toEqual({
      followsBusiness: UNKNOWN_VALUE_PLACEHOLDER,
      followerCount: UNKNOWN_VALUE_PLACEHOLDER,
    })
  })

  test("instagram renders false and 0 instead of a dash", () => {
    expect(
      valuesByKey(buildInbox({ followsBusiness: false, followerCount: 0 })),
    ).toEqual({
      followsBusiness: "fields.channelProfile.no",
      followerCount: "#0",
    })
  })

  test("instagram renders true and a positive count", () => {
    expect(
      valuesByKey(buildInbox({ followsBusiness: true, followerCount: 1500 })),
    ).toEqual({
      followsBusiness: "fields.channelProfile.yes",
      followerCount: "#1500",
    })
  })

  test("rows are read-only and labelled through i18n keys", () => {
    const rows = buildScopedIdentityFields(
      buildInbox({ followsBusiness: true, followerCount: 3 }),
      context,
    )
    expect(rows.map((row) => row.label)).toEqual([
      "fields.channelProfile.followsBusiness",
      "fields.channelProfile.followerCount",
    ])
    expect(rows.every((row) => row.readOnly)).toBe(true)
  })

  test("a non-instagram channel gets no instagram rows", () => {
    expect(
      buildScopedIdentityFields(
        buildInbox({
          channel: "messenger",
          followsBusiness: true,
          followerCount: 9,
        }),
        context,
      ),
    ).toEqual([])
  })

  test("whatsapp still hides unknown values and shows set ones", () => {
    expect(
      valuesByKey(
        buildInbox({
          channel: "whatsapp",
          sourceUserId: "bsuid-1",
          sourceUsername: null,
        }),
      ),
    ).toEqual({ sourceUserId: "bsuid-1" })
  })

  test("an unknown channel or missing inbox yields no rows", () => {
    expect(buildScopedIdentityFields(undefined, context)).toEqual([])
    expect(
      buildScopedIdentityFields(buildInbox({ channel: "bogus" }), context),
    ).toEqual([])
  })
})
