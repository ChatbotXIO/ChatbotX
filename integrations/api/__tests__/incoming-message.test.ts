import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"

describe("api receiveMessage — step input skip payload", () => {
  test("hands postbackPayload to the worker unchanged as postbackAction", async () => {
    const result = await receiveMessage({
      data: {
        integrationType: "api",
        integrationIdentifier: "inbox-1",
        payload: {
          contact: { sourceId: "contact-1" },
          message: { sourceId: "msg-1", text: "Skip" },
          postbackPayload: "STEP_INPUT_SKIP|11612473309626368",
        },
      },
    })

    expect(result.postbackAction).toBe("STEP_INPUT_SKIP|11612473309626368")
  })
})
