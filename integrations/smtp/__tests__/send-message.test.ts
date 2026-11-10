import { beforeEach, describe, expect, test, vi } from "vitest"

const sendMailMock = vi.fn()
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}))

import {
  buildReplySubject,
  buildThreadHeaders,
  extractEmailAddress,
  generateMessageId,
  textToHtml,
} from "../src/handlers/message/email-headers"
import { sendFlowStep } from "../src/handlers/message/send-flow-step"
import { sendMessage } from "../src/handlers/message/send-message"

const ctx = {
  auth: {
    authType: "custom",
    provider: "other",
    host: "smtp.test",
    port: 587,
    username: "u",
    password: "p",
  },
  integrationDetail: { fromAddress: "support@acme.test" },
} as never

const ACME_MESSAGE_ID = /^<[0-9a-f-]{36}@acme\.test>$/

const contact = { id: "c1", sourceId: "jane@example.com" }

beforeEach(() => sendMailMock.mockReset())

describe("email headers", () => {
  test("prefixes Re: once", () => {
    expect(buildReplySubject("Hello")).toBe("Re: Hello")
    expect(buildReplySubject("re: Hello")).toBe("re: Hello")
    expect(buildReplySubject(undefined)).toBe("New message")
  })

  test("builds In-Reply-To and bounded unique References", () => {
    const headers = buildThreadHeaders({
      messageId: "<c@x>",
      references: ["<a@x>", "<c@x>"],
    })
    expect(headers).toEqual({
      inReplyTo: "<c@x>",
      references: ["<a@x>", "<c@x>"],
    })
    expect(buildThreadHeaders({})).toEqual({})
  })

  test("extracts the bare address from a 'Name <email>' from address", () => {
    expect(extractEmailAddress("Acme Support <Support@Acme.test>")).toBe(
      "support@acme.test",
    )
    expect(extractEmailAddress("support@acme.test")).toBe("support@acme.test")
  })

  test("builds a well-formed Message-ID from a 'Name <email>' from address", () => {
    expect(generateMessageId("Acme <support@acme.test>")).toMatch(
      ACME_MESSAGE_ID,
    )
  })

  test("escapes html", () => {
    expect(textToHtml("a <b>\nc\n\nd")).toBe("<p>a &lt;b&gt;<br>c</p><p>d</p>")
  })
})

describe("sendMessage", () => {
  test("sends threaded reply and returns generated Message-ID", async () => {
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          text: "Thanks!",
          contentAttributes: {
            email: { subject: "Order", messageId: "<in@x>" },
          },
        },
      },
    } as never)

    const mail = sendMailMock.mock.calls[0][0]
    expect(mail).toMatchObject({
      from: "support@acme.test",
      to: "jane@example.com",
      subject: "Re: Order",
      inReplyTo: "<in@x>",
      references: ["<in@x>"],
    })
    expect(result.messageIds).toEqual([mail.messageId])
    expect(result.sentCount).toBe(1)
  })

  test("rejects a contact without an email address", async () => {
    await expect(
      sendMessage({
        ctx,
        data: {
          contact: { id: "c", sourceId: "nope" },
          message: { text: "x" },
        },
      } as never),
    ).rejects.toThrow("no email address")
  })
})

describe("sendFlowStep", () => {
  test("appends website buttons as links", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "f",
        step: {
          stepType: "sendText",
          text: "Hi",
          buttons: [
            {
              buttonType: "openWebsite",
              label: "Docs",
              beforeStep: { url: "https://a.test" },
            },
            { buttonType: "sendFlow", label: "Skip" },
          ],
        },
      },
    } as never)
    expect(sendMailMock.mock.calls[0][0].text).toBe(
      "Hi\n\nDocs: https://a.test",
    )
  })

  test("throws for unsupported step types", async () => {
    await expect(
      sendFlowStep({
        ctx,
        data: { contact, flowId: "f", step: { stepType: "sendImage" } },
      } as never),
    ).rejects.toThrow("does not support")
  })
})
