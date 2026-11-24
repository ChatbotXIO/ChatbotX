import { describe, expect, test } from "vitest"
import { connectedInboxLabel } from "../connected-inbox-label"

describe("connectedInboxLabel", () => {
  test("keeps a messenger page name as stored on the inbox", () => {
    expect(connectedInboxLabel({ name: "Udbhabon Page" })).toBe("Udbhabon Page")
  })

  test("appends the WhatsApp phone when the name does not already include it", () => {
    expect(
      connectedInboxLabel({
        name: "Udbhabon",
        integrationWhatsapp: { displayPhoneNumber: "+8801711000000" },
      }),
    ).toBe("Udbhabon · +8801711000000")
  })

  test("does not repeat a phone that is already the inbox name", () => {
    expect(
      connectedInboxLabel({
        name: "+8801711000000",
        integrationWhatsapp: { displayPhoneNumber: "+8801711000000" },
      }),
    ).toBe("+8801711000000")
  })

  test("appends an Instagram username", () => {
    expect(
      connectedInboxLabel({
        name: "Udbhabon",
        integrationInstagram: { username: "udbhabon" },
      }),
    ).toBe("Udbhabon · @udbhabon")
  })
})
