import { describe, expect, test } from "vitest"
import { resolveMessengerPersonaId } from "../src/handlers/message/outgoing-message/persona"
import type { MessengerIntegrationDetail } from "../src/schema"

const makeContact = (personaId?: string | null) => ({
  id: "contact-1",
  sourceId: "psid-1",
  personaId,
})

const detail: MessengerIntegrationDetail = {
  personaId: "fb-default",
  personas: [
    { id: "local-a", facebookPersonaId: "fb-a" },
    { id: "local-b", facebookPersonaId: "fb-b" },
    { id: "local-unregistered" },
  ],
}

describe("resolveMessengerPersonaId", () => {
  test("falls back to the page default when the contact has no persona", () => {
    expect(resolveMessengerPersonaId(detail, makeContact(null))).toBe(
      "fb-default",
    )
  })

  test("resolves a contact's local persona id to its Facebook persona id", () => {
    expect(resolveMessengerPersonaId(detail, makeContact("local-b"))).toBe(
      "fb-b",
    )
  })

  test("falls back to default when the chosen persona has no Facebook id", () => {
    expect(
      resolveMessengerPersonaId(detail, makeContact("local-unregistered")),
    ).toBe("fb-default")
  })

  test("falls back to default when the persona is not on this page (deleted/other page)", () => {
    expect(resolveMessengerPersonaId(detail, makeContact("local-gone"))).toBe(
      "fb-default",
    )
  })

  test("returns undefined when there is no default and no match", () => {
    expect(
      resolveMessengerPersonaId(
        { personaId: "", personas: [] },
        makeContact("local-x"),
      ),
    ).toBeUndefined()
  })

  test("tolerates a missing personas list", () => {
    expect(
      resolveMessengerPersonaId({ personaId: "fb-default" }, makeContact("x")),
    ).toBe("fb-default")
  })
})
