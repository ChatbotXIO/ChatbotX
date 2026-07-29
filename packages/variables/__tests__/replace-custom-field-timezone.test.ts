import { describe, expect, test } from "vitest"
import { contactVariableService } from "../src/contact-variable"
import type { ReplaceVariableProps } from "../src/schema"

// 2026-07-22T08:30:00Z is 15:30 wall-clock at UTC+7 (VN / Bangkok).
const DATETIME_UTC = "2026-07-22T08:30:00.000Z"

const makeProps = (
  contactTz: string | null,
  workspaceTz: string | null,
): ReplaceVariableProps =>
  ({
    contact: { timezone: contactTz },
    contactInbox: null,
    conversation: null,
    workspace: workspaceTz === null ? null : { timezone: workspaceTz },
    customFieldsMap: new Map([
      [
        "booking_at",
        {
          key: "booking_at",
          type: "datetime",
          value: DATETIME_UTC,
          description: "",
        },
      ],
    ]),
  }) as unknown as ReplaceVariableProps

describe("replaceAll renders date/datetime custom fields contact-first", () => {
  test("prefers the contact timezone over the workspace timezone", async () => {
    expect(
      await contactVariableService.replaceAll({
        text: "Booking: {{booking_at}}",
        variables: makeProps("Asia/Ho_Chi_Minh", "UTC"),
      }),
    ).toBe("Booking: 2026-07-22 15:30:00")
  })

  test("falls back to the workspace timezone when the contact has none", async () => {
    expect(
      await contactVariableService.replaceAll({
        text: "Booking: {{booking_at}}",
        variables: makeProps(null, "Asia/Ho_Chi_Minh"),
      }),
    ).toBe("Booking: 2026-07-22 15:30:00")
  })

  test("normalizes an offset-style contact timezone (e.g. Messenger '+7')", async () => {
    expect(
      await contactVariableService.replaceAll({
        text: "Booking: {{booking_at}}",
        variables: makeProps("+7", "UTC"),
      }),
    ).toBe("Booking: 2026-07-22 15:30:00")
  })
})
