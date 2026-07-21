import { describe, expect, test } from "vitest"
import { handleMessageStatus } from "../src/handlers/message/message-status"
import type { MessengerAuthValue } from "../src/schema"

const ctx = {
  auth: {
    metadata: {
      pageId: "page-1",
      pageName: "Page",
      version: "v23.0",
    },
  } as MessengerAuthValue,
}

describe("handleMessageStatus", () => {
  test("parses Messenger delivery status payloads", async () => {
    const result = await handleMessageStatus({
      ctx,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        payload: {
          contactSourceId: "psid-1",
          messageId: "mid.1",
          status: "delivered",
          timestamp: "1700000000456",
        },
      },
    })

    expect(result).toEqual({
      message: {
        sourceId: "mid.1",
        messageType: "incoming",
        contentType: "text",
      },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
      contact: {
        sourceId: "psid-1",
      },
    })
  })
})
