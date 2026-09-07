import { FieldOperationType } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { addContactCustomFieldRequest } from "@/features/contacts/schema/contact-custom-field"

// O5: the private addContactCustomFieldRequest.ids had no .max() while the
// public routes cap bulk operations at 200 — applyOperationToContacts runs a
// serial FOR UPDATE per id inside one transaction, so an unbounded array is a
// long-held-lock risk.
describe("addContactCustomFieldRequest", () => {
  const base = {
    customFieldId: "1",
    operation: FieldOperationType.set,
    value: "hello",
  }

  test("accepts up to 200 ids", () => {
    const ids = Array.from({ length: 200 }, (_, i) => String(i + 1))
    const result = addContactCustomFieldRequest.safeParse({ ...base, ids })
    expect(result.success).toBe(true)
  })

  test("rejects more than 200 ids", () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i + 1))
    const result = addContactCustomFieldRequest.safeParse({ ...base, ids })
    expect(result.success).toBe(false)
  })
})
