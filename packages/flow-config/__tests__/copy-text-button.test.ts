import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  BUTTON_LABEL_MAX,
  buttonStepDefaultFn,
  buttonStepSchema,
  COPY_TEXT_EXPRESSION_MAX,
  COPY_TEXT_MAX,
  chooseChannelStepDefaultFn,
  copyTextStepDefaultFn,
  flowSpecSchema,
  flowValidationCodes,
  getChannelFlowPolicy,
  isCopyableText,
  isNativeButtonType,
  publishFlowSchema,
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
  sendQuickReplyStepSchema,
  sendsAsNativeCopyButton,
  sendTextStepDefaultFn,
  whatsappFlowStepSchema,
} from "../src"

const copyButton = (text: string) => ({
  ...buttonStepDefaultFn({ label: "Copiar PIX" }),
  buttonType: "copyText" as const,
  beforeStep: { ...copyTextStepDefaultFn(), text },
})

describe("copyText button schema", () => {
  test("accepts a literal up to the copy limit", () => {
    expect(
      buttonStepSchema.safeParse(copyButton("x".repeat(COPY_TEXT_MAX))).success,
    ).toBe(true)
  })

  test("rejects a literal longer than the copy limit", () => {
    expect(
      buttonStepSchema.safeParse(copyButton("x".repeat(COPY_TEXT_MAX + 1)))
        .success,
    ).toBe(false)
  })

  test("rejects an empty text", () => {
    expect(buttonStepSchema.safeParse(copyButton("  ")).success).toBe(false)
  })

  test("accepts a variable expression longer than the copy limit", () => {
    const text = `{{bot_field:123}}${"x".repeat(COPY_TEXT_MAX)}`
    expect(buttonStepSchema.safeParse(copyButton(text)).success).toBe(true)
  })

  test("caps a variable expression", () => {
    const text = `{{pix_code}}${"x".repeat(COPY_TEXT_EXPRESSION_MAX)}`
    expect(buttonStepSchema.safeParse(copyButton(text)).success).toBe(false)
  })

  test("cannot run follow-up steps", () => {
    const button = {
      ...copyButton("abc"),
      steps: [{ id: "9", stepType: "addContactTag", tagIds: [] }],
    }
    expect(buttonStepSchema.safeParse(button).success).toBe(false)
  })

  test("labels follow the shared label limit", () => {
    const button = {
      ...copyButton("abc"),
      label: "x".repeat(BUTTON_LABEL_MAX + 1),
    }
    expect(buttonStepSchema.safeParse(button).success).toBe(false)
  })
})

describe("isCopyableText", () => {
  test.each([
    ["an empty text", "", false],
    ["a PIX-sized text", "x".repeat(150), true],
    ["the limit", "x".repeat(COPY_TEXT_MAX), true],
    ["past the limit", "x".repeat(COPY_TEXT_MAX + 1), false],
  ])("%s", (_name, text, expected) => {
    expect(isCopyableText(text)).toBe(expected)
  })
})

describe("copyText channel policy", () => {
  test("only Telegram copies natively", () => {
    expect(isNativeButtonType("telegram", "copyText")).toBe(true)
    for (const channel of [
      "messenger",
      "zalo",
      "webchat",
      "instagram",
      "tiktok",
      "whatsapp",
      "omnichannel",
    ]) {
      expect(isNativeButtonType(channel, "copyText"), channel).toBe(false)
    }
  })

  test("Telegram takes up to 10 buttons", () => {
    expect(getChannelFlowPolicy("telegram")?.limits.buttonCount).toBe(10)
  })

  test("sendsAsNativeCopyButton needs a native channel and a copyable text", () => {
    expect(sendsAsNativeCopyButton("telegram", copyButton("abc"))).toBe(true)
    expect(sendsAsNativeCopyButton("messenger", copyButton("abc"))).toBe(false)
    expect(sendsAsNativeCopyButton("telegram", copyButton(""))).toBe(false)
    expect(
      sendsAsNativeCopyButton(
        "telegram",
        copyButton("x".repeat(COPY_TEXT_MAX + 1)),
      ),
    ).toBe(false)
    expect(
      sendsAsNativeCopyButton("telegram", buttonStepDefaultFn({ label: "x" })),
    ).toBe(false)
  })
})

describe("copyText button placement", () => {
  test("a quick-reply step rejects it", () => {
    const result = sendQuickReplyStepSchema.safeParse({
      id: "1",
      stepType: "sendQuickReply",
      message: "Pick one",
      buttons: [copyButton("abc")],
    })
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.buttonCopyTextUnsupported,
    )
  })

  test("a send-message node's quick replies reject it", () => {
    const shape = sendMessageNodeSchema.shape.data.shape.details.shape
    const result = shape.quickReplies.safeParse([copyButton("abc")])
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.buttonCopyTextUnsupported,
    )
  })

  test("a WhatsApp Flow step rejects it as its CTA", () => {
    const result = whatsappFlowStepSchema.shape.buttons.safeParse([
      copyButton("abc"),
    ])
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.buttonCopyTextUnsupported,
    )
  })
})

describe("copyText in a published graph", () => {
  const publish = (channel: string, buttons: unknown[]) => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: { id: "1" },
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({
          channel: channel as "whatsapp",
        }),
      },
    })
    const step = {
      ...sendTextStepDefaultFn({ text: "Pague com PIX" }),
      buttons,
    }
    return publishFlowSchema.safeParse({
      nodes: [
        {
          ...node,
          data: {
            ...node.data,
            details: { ...node.data.details, steps: [step] },
          },
        },
      ],
      edges: [],
    })
  }

  test("a text step with a copy button publishes on every channel", () => {
    for (const channel of [
      "telegram",
      "messenger",
      "zalo",
      "webchat",
      "whatsapp",
      "instagram",
      "tiktok",
      "omnichannel",
    ]) {
      expect(
        publish(channel, [copyButton("{{pix_code}}")]).success,
        channel,
      ).toBe(true)
    }
  })

  test("Telegram publishes 10 buttons but not 11", () => {
    const buttons = (count: number) =>
      Array.from({ length: count }, () => copyButton("abc"))
    expect(publish("telegram", buttons(10)).success).toBe(true)
    expect(publish("telegram", buttons(11)).success).toBe(false)
  })

  test("other channels keep the 3-button limit", () => {
    const buttons = Array.from({ length: 4 }, () => copyButton("abc"))
    expect(publish("messenger", buttons).success).toBe(false)
  })
})

describe("FlowSpec copy button", () => {
  const spec = (button: unknown) => ({
    formatVersion: 1,
    name: "PIX flow",
    steps: [{ type: "send", text: "Hi", buttons: [button] }],
  })

  test("the FlowSpec JSON schema exposes the copy field", () => {
    expect(JSON.stringify(z.toJSONSchema(flowSpecSchema))).toContain('"copy":{')
  })

  test("accepts a copy button", () => {
    expect(
      flowSpecSchema.safeParse(spec({ text: "Copiar", copy: "{{pix_code}}" }))
        .success,
    ).toBe(true)
  })

  test("rejects copy combined with then", () => {
    expect(
      flowSpecSchema.safeParse(
        spec({
          text: "Copiar",
          copy: "abc",
          // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
          then: [{ type: "addNote", note: "x" }],
        }),
      ).success,
    ).toBe(false)
  })

  test("rejects copy combined with call", () => {
    expect(
      flowSpecSchema.safeParse(
        spec({ text: "Copiar", copy: "abc", call: "+14155552671" }),
      ).success,
    ).toBe(false)
  })
})
