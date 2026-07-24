import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import type { ContactVariableContext } from "../src/schema"
import { getSystemFieldValue } from "../src/utils"

// 2026-07-22T20:00Z is 2026-07-23 03:00 in VN (UTC+7): the calendar day differs
// between UTC and the contact zone, so a `date` field discriminates the two.
const NEAR_MIDNIGHT_UTC = new Date("2026-07-22T20:00:00.000Z")
// 2026-07-22T08:30Z is 15:30 in VN, 08:30 in UTC.
const MIDDAY_UTC = new Date("2026-07-22T08:30:00.000Z")

const makeContext = (
  contactTz: string | null,
  workspaceTz: string | null,
  inbox: Record<string, unknown>,
): ContactVariableContext =>
  ({
    contact: { timezone: contactTz },
    contactInbox: inbox,
    conversation: null,
    workspace: workspaceTz === null ? null : { timezone: workspaceTz },
  }) as unknown as ContactVariableContext

describe("subscribed_date renders contact-first", () => {
  test("uses the contact timezone over the workspace timezone", async () => {
    const ctx = makeContext("Asia/Ho_Chi_Minh", "UTC", {
      createdAt: NEAR_MIDNIGHT_UTC,
    })
    expect(
      await getSystemFieldValue(ctx, systemFieldTypes.enum.subscribed_date),
    ).toBe("2026-07-23")
  })

  test("falls back to the workspace timezone when the contact has none", async () => {
    const ctx = makeContext(null, "Asia/Ho_Chi_Minh", {
      createdAt: NEAR_MIDNIGHT_UTC,
    })
    expect(
      await getSystemFieldValue(ctx, systemFieldTypes.enum.subscribed_date),
    ).toBe("2026-07-23")
  })
})

describe("last_seen renders contact-first", () => {
  test("uses the contact timezone over the workspace timezone", async () => {
    const ctx = makeContext("Asia/Ho_Chi_Minh", "UTC", {
      contactLastReadAt: MIDDAY_UTC,
    })
    expect(
      await getSystemFieldValue(ctx, systemFieldTypes.enum.last_seen),
    ).toBe("2026-07-22 15:30:00")
  })

  test("normalizes an offset-style contact timezone (Messenger '+7')", async () => {
    const ctx = makeContext("+7", "UTC", { contactLastReadAt: MIDDAY_UTC })
    expect(
      await getSystemFieldValue(ctx, systemFieldTypes.enum.last_seen),
    ).toBe("2026-07-22 15:30:00")
  })
})
