import { describe, expect, test } from "vitest"
import { resolveOriginInbox } from "../resolve-origin-inbox"

const messenger = {
  id: "ci-messenger",
  inboxId: "inbox-messenger",
  channel: "messenger",
  inbox: { name: "Udbhabon Page" },
}
const whatsapp = {
  id: "ci-whatsapp",
  inboxId: "inbox-whatsapp",
  channel: "whatsapp",
  inbox: { name: "Support Line" },
}

describe("resolveOriginInbox", () => {
  test("uses the inbox of the latest message when the contact has several", () => {
    expect(resolveOriginInbox([messenger, whatsapp], "ci-whatsapp")).toEqual({
      contactInboxId: "ci-whatsapp",
      inboxId: "inbox-whatsapp",
      channel: "whatsapp",
      name: "Support Line",
    })
  })

  test("uses the only inbox when no last message is loaded", () => {
    expect(resolveOriginInbox([messenger], null)).toEqual({
      contactInboxId: "ci-messenger",
      inboxId: "inbox-messenger",
      channel: "messenger",
      name: "Udbhabon Page",
    })
  })

  test("stays blank when several inboxes exist and the last message matches none", () => {
    expect(resolveOriginInbox([messenger, whatsapp], "missing")).toBeNull()
    expect(resolveOriginInbox([messenger, whatsapp], null)).toBeNull()
  })

  test("ignores a blank inbox name", () => {
    expect(
      resolveOriginInbox(
        [{ ...messenger, inbox: { name: "   " } }],
        "ci-messenger",
      ),
    ).toBeNull()
  })
})
