import {
  COMMENT_AUTOMATION_PAYLOAD_TYPE,
  decodeButtonPayload,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"
import { getButtonTemplate } from "../src/handlers/message/outgoing-message/send-button"
import { convertFlowStepMediaV2 } from "../src/handlers/message/outgoing-message/send-media-v2"
import { buildMessengerTemplateComponents } from "../src/handlers/message/outgoing-message/send-messenger-template"
import { convertQuickReplies } from "../src/handlers/message/outgoing-message/send-quick-reply"

vi.mock("../src/apis/attachment", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ attachment_id: "att-1" }),
}))

/**
 * The payload encoded here is the one the contact actually taps. The worker's
 * `convertButtonsToTemplate` encodes a separate copy for the `Message` row, so
 * attribution added to only one of the two is invisible to the click — exactly
 * the bug these tests exist to prevent coming back.
 */

const COMMENT_AUTOMATION_METADATA = {
  type: COMMENT_AUTOMATION_PAYLOAD_TYPE,
  commentAutomationId: "11586686590533632",
  commentId: "2357494887629356_1544045903933592",
  replyChannel: "private",
} as MetadataPayload

const button = {
  id: "789",
  label: "Xem thêm",
  buttonType: null,
  beforeStep: null,
  steps: [],
} as never

describe("comment automation attribution on a Messenger step button", () => {
  test("the tapped postback carries the automation id", () => {
    const template = getButtonTemplate({
      flowId: "11638426147094528",
      flowVersionId: "456",
      button,
      metadata: COMMENT_AUTOMATION_METADATA,
      contactInboxId: "321",
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
      contactInboxId: "321",
    })

    expect(
      decodeButtonPayload((template as { payload: string }).payload),
    ).not.toHaveProperty("commentAutomationId")
  })

  test("broadcast attribution still rides alongside, unchanged", () => {
    const template = getButtonTemplate({
      flowId: "11638426147094528",
      button,
      metadata: {
        type: "broadcast",
        broadcastId: "111",
        contactInboxId: "321",
      } as MetadataPayload,
      contactInboxId: "321",
    })

    const decoded = decodeButtonPayload(
      (template as { payload: string }).payload,
    )
    expect(decoded?.broadcastId).toBe("111")
    expect(decoded).not.toHaveProperty("commentAutomationId")
  })
})

describe("comment automation attribution on a Messenger quick reply", () => {
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

// An image/video step WITH buttons is not sent inline — it routes to the media
// template, a fourth encoder path reached through `convertButtons`.
// That call site was the one that forgot to forward `metadata`, so these taps
// reported nothing to comment automation, broadcasts or sequences alike, with
// no compile error and an identical-looking message in the inbox.
describe("comment automation attribution on a Messenger media step", () => {
  const mediaButtonPayload = async (metadata?: MetadataPayload) => {
    const messages: unknown[] = []
    for await (const message of convertFlowStepMediaV2({
      ctx: { auth: {} },
      data: {
        flowId: "11638426147094528",
        flowVersionId: "456",
        step: {
          stepType: "sendImage",
          url: "https://example.com/a.png",
          buttons: [button],
        },
        metadata,
        contact: { id: "321" },
      },
    } as never)) {
      messages.push(message)
    }

    const element = (
      messages[0] as {
        attachment?: {
          payload?: { elements?: { buttons?: { payload?: string }[] }[] }
        }
      }
    )?.attachment?.payload?.elements?.[0]
    return element?.buttons?.[0]?.payload
  }

  test("the tapped postback carries the automation id", async () => {
    expect(
      decodeButtonPayload(
        (await mediaButtonPayload(COMMENT_AUTOMATION_METADATA)) ?? "",
      )?.commentAutomationId,
    ).toBe("11586686590533632")
  })

  test("a media step from an ordinary flow carries no automation id", async () => {
    expect(
      decodeButtonPayload((await mediaButtonPayload()) ?? ""),
    ).not.toHaveProperty("commentAutomationId")
  })
})

describe("comment automation attribution on a Messenger template button", () => {
  // The third encoder in this package. A `sendMessengerTemplateMessage` step is
  // a real flow step, so a comment automation's flow reply can reach it.
  const buildButtonPayload = (metadata?: MetadataPayload) => {
    const [component] = buildMessengerTemplateComponents(
      { button: [] } as never,
      "POSITIONAL",
      {
        flowId: "11638426147094528",
        flowVersionId: "456",
        metadata,
        flowButtons: [button],
      },
    )
    return (component?.parameters?.[0] as { payload?: string } | undefined)
      ?.payload
  }

  test("the tapped postback carries the automation id", () => {
    expect(
      decodeButtonPayload(buildButtonPayload(COMMENT_AUTOMATION_METADATA) ?? "")
        ?.commentAutomationId,
    ).toBe("11586686590533632")
  })

  test("a template from an ordinary flow carries no automation id", () => {
    expect(decodeButtonPayload(buildButtonPayload() ?? "")).not.toHaveProperty(
      "commentAutomationId",
    )
  })
})
