import {
  COMMENT_AUTOMATION_PAYLOAD_TYPE,
  decodeButtonPayload,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { getButtonTemplate } from "../src/handlers/message/outgoing-message/send-button"
import { convertQuickReplies } from "../src/handlers/message/outgoing-message/send-quick-reply"

/**
 * The payload encoded here is the one the contact actually taps. The worker's
 * `convertButtonsToTemplate` encodes a separate copy for the `Message` row, so
 * attribution added to only one of the two is invisible to the click — exactly
 * the bug these tests exist to prevent coming back.
 */

const COMMENT_AUTOMATION_METADATA = {
  type: COMMENT_AUTOMATION_PAYLOAD_TYPE,
  commentAutomationId: "11586686590533632",
  commentId: "17912345678901234",
  replyChannel: "private",
} as MetadataPayload

const button = {
  id: "789",
  label: "Xem thêm",
  buttonType: null,
  beforeStep: null,
  steps: [],
} as never

describe("comment automation attribution on an Instagram step button", () => {
  test("the tapped postback carries the automation id", () => {
    const template = getButtonTemplate({
      flowId: "11638426147094528",
      flowVersionId: "456",
      button,
      metadata: COMMENT_AUTOMATION_METADATA,
    })

    expect(template.type).toBe("postback")
    expect(
      decodeButtonPayload((template as { payload: string }).payload)
        ?.commentAutomationId,
    ).toBe("11586686590533632")
  })

  test("a button from an ordinary flow carries no automation id", () => {
    const template = getButtonTemplate({
      flowId: "11638426147094528",
      button,
    })

    expect(
      decodeButtonPayload((template as { payload: string }).payload),
    ).not.toHaveProperty("commentAutomationId")
  })
})

describe("comment automation attribution on an Instagram quick reply", () => {
  test("the tapped payload carries the automation id", () => {
    const [quickReply] = convertQuickReplies({
      flowId: "11638426147094528",
      buttons: [button],
      metadata: COMMENT_AUTOMATION_METADATA,
    })

    expect(
      decodeButtonPayload(quickReply?.payload ?? "")?.commentAutomationId,
    ).toBe("11586686590533632")
  })
})
