import { describe, expect, test } from "vitest"
import {
  buildChannelIdentity,
  resolveContactMessagingId,
} from "../src/meta-conversions/channel-identity"

const messengerIntegration = { pageId: "page-1" }
const instagramIntegration = { igId: "ig-user-1" }
const whatsappIntegration = { wabaId: "waba-1" }

describe("buildChannelIdentity", () => {
  test("messenger pairs the page id with the page-scoped user id", () => {
    expect(
      buildChannelIdentity(
        "messenger",
        messengerIntegration as never,
        "psid-1",
      ),
    ).toEqual({
      messagingChannel: "messenger",
      pageId: "page-1",
      pageScopedUserId: "psid-1",
    })
  })

  test("instagram pairs the IG account id with the IG-scoped user id", () => {
    expect(
      buildChannelIdentity(
        "instagram",
        instagramIntegration as never,
        "igsid-1",
      ),
    ).toEqual({
      messagingChannel: "instagram",
      instagramBusinessAccountId: "ig-user-1",
      igSid: "igsid-1",
    })
  })

  test("whatsapp pairs the WABA id with the click-to-WhatsApp click id", () => {
    expect(
      buildChannelIdentity("whatsapp", whatsappIntegration as never, "ctwa-1"),
    ).toEqual({
      messagingChannel: "whatsapp",
      wabaId: "waba-1",
      ctwaClid: "ctwa-1",
    })
  })
})

describe("resolveContactMessagingId", () => {
  test("messenger and instagram identify the contact by its source id", () => {
    const contactInbox = { sourceId: "src-1", ctwaClid: null }

    expect(resolveContactMessagingId("messenger", contactInbox)).toBe("src-1")
    expect(resolveContactMessagingId("instagram", contactInbox)).toBe("src-1")
  })

  test("whatsapp identifies the contact by its ctwa_clid, never the phone", () => {
    expect(
      resolveContactMessagingId("whatsapp", {
        sourceId: "8490000000",
        ctwaClid: "ctwa-1",
      }),
    ).toBe("ctwa-1")
  })

  test("whatsapp throws when the contact has no ctwa_clid", () => {
    expect(() =>
      resolveContactMessagingId("whatsapp", {
        sourceId: "8490000000",
        ctwaClid: null,
      }),
    ).toThrow("Missing ctwa_clid for WhatsApp Meta CAPI event")
  })
})
