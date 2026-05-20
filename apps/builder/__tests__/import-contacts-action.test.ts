// @vitest-environment node
import { describe, expect, test } from "vitest"
import { importContactsRequest } from "@/features/contacts/schemas/contact-import"

describe("importContactsRequest schema", () => {
  // Non-whatsapp channels require a contactId mapping (superRefine).
  const validBase = {
    fileId: "1234567890",
    channel: "messenger" as const,
    inboxId: "100",
    contactId: "external_id",
  }

  test("accepts minimal valid input", () => {
    const parsed = importContactsRequest.parse(validBase)

    expect(parsed.fileId).toBe("1234567890")
    expect(parsed.channel).toBe("messenger")
    expect(parsed.inboxId).toBe("100")
  })

  test("rejects missing fileId", () => {
    const result = importContactsRequest.safeParse({
      ...validBase,
      fileId: "",
    })

    expect(result.success).toBe(false)
  })

  test("rejects non-numeric fileId", () => {
    const result = importContactsRequest.safeParse({
      ...validBase,
      fileId: "abc",
    })

    expect(result.success).toBe(false)
  })

  test("rejects missing inboxId", () => {
    const result = importContactsRequest.safeParse({
      ...validBase,
      inboxId: "",
    })

    expect(result.success).toBe(false)
  })

  test("accepts optional column hints and fieldMapping", () => {
    const parsed = importContactsRequest.parse({
      ...validBase,
      phoneNumber: "phone",
      email: "email",
      firstName: "first",
      lastName: "last",
      contactId: "external_id",
      tagId: "55",
      fieldMapping: [
        { column: "company", customFieldId: "1" },
        { column: "role", customFieldId: "2" },
      ],
    })

    expect(parsed.fieldMapping).toHaveLength(2)
    expect(parsed.tagId).toBe("55")
  })

  test("drops fieldMapping entries missing column or customFieldId", () => {
    const parsed = importContactsRequest.parse({
      ...validBase,
      fieldMapping: [
        { column: "company" },
        { customFieldId: "2" },
        { column: "role", customFieldId: "3" },
      ],
    })

    expect(parsed.fieldMapping).toEqual([
      { column: "role", customFieldId: "3" },
    ])
  })

  test("rejects invalid channel", () => {
    const result = importContactsRequest.safeParse({
      ...validBase,
      channel: "carrier-pigeon",
    })

    expect(result.success).toBe(false)
  })

  test("rejects a non-whatsapp channel with no contactId", () => {
    const { contactId, ...withoutContactId } = validBase
    const result = importContactsRequest.safeParse(withoutContactId)

    expect(result.success).toBe(false)
  })

  test("requires phoneNumber when channel is whatsapp", () => {
    const result = importContactsRequest.safeParse({
      ...validBase,
      channel: "whatsapp",
    })

    expect(result.success).toBe(false)
  })

  test("accepts whatsapp channel with phoneNumber and countryCode", () => {
    const parsed = importContactsRequest.parse({
      ...validBase,
      channel: "whatsapp",
      phoneNumber: "phone",
      countryCode: "+84",
    })

    expect(parsed.countryCode).toBe("+84")
    expect(parsed.phoneNumber).toBe("phone")
  })
})
