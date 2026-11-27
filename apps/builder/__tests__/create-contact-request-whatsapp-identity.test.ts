import { describe, expect, test } from "vitest"
import { createContactRequest } from "@/features/contacts/schema/action"

const whatsappBase = {
  email: "",
  gender: "unknown" as const,
  channel: "whatsapp" as const,
  inboxId: "1",
}

const issuePaths = (input: Record<string, unknown>) => {
  const result = createContactRequest.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."))
}

describe("createContactRequest — WhatsApp identity", () => {
  test("accepts a phone number alone", () => {
    expect(
      issuePaths({ ...whatsappBase, phoneNumber: "+15551234567" }),
    ).toEqual([])
  })

  test("accepts a BSUID alone", () => {
    expect(
      issuePaths({ ...whatsappBase, sourceUserId: "US.13491208655302741918" }),
    ).toEqual([])
  })

  test("accepts both a phone number and a BSUID", () => {
    expect(
      issuePaths({
        ...whatsappBase,
        phoneNumber: "+15551234567",
        sourceUserId: "US.13491208655302741918",
      }),
    ).toEqual([])
  })

  test("requires a phone number or a BSUID", () => {
    expect(
      issuePaths({ ...whatsappBase, phoneNumber: "", sourceUserId: "" }),
    ).toEqual(["phoneNumber"])
  })

  test("rejects a digits-only BSUID, which would collide with a phone-based wa_id", () => {
    expect(
      issuePaths({ ...whatsappBase, sourceUserId: "15551234567" }),
    ).toContain("sourceUserId")
  })

  test("rejects a BSUID on a non-WhatsApp channel", () => {
    expect(
      issuePaths({
        ...whatsappBase,
        channel: "messenger",
        contactId: "psid-1",
        sourceUserId: "US.13491208655302741918",
      }),
    ).toEqual(["sourceUserId"])
  })
})
