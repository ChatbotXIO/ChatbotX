import { beforeEach, describe, expect, test, vi } from "vitest"

const storeIncomingImage = vi.fn()
vi.mock("@chatbotx.io/utils/store-incoming-image", () => ({
  storeIncomingImage: (...args: unknown[]) => storeIncomingImage(...args),
  toStoredMediaFields: (stored: Record<string, unknown>) => stored,
}))

import { receiveMessage } from "../src/handlers/message/receive-message"

const ctx = {
  storagePrefix: "ws/1",
  uploader: {},
  auth: {},
  integrationDetail: { fromAddress: "Support <support@acme.test>" },
} as never

const toPayload = (lines: string[]) => ({
  raw: Buffer.from(lines.join("\r\n")).toString("base64"),
})

const receive = (lines: string[]) =>
  receiveMessage({
    ctx,
    data: {
      integrationType: "smtp",
      integrationIdentifier: "inbox-1",
      payload: toPayload(lines),
    },
  } as never)

const customerMail = [
  "From: Jane Doe <jane@example.com>",
  "To: support@acme.test",
  "Subject: Where is my order?",
  "Message-ID: <m1@example.com>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Any update?",
  "",
  "On Mon, 3 Nov 2026, Support <support@acme.test> wrote:",
  "> We shipped it",
]

beforeEach(() => {
  storeIncomingImage.mockReset()
})

describe("receiveMessage", () => {
  test("maps a customer mail to a contact keyed by their email and a threaded message", async () => {
    const result = await receive(customerMail)

    expect(result?.contact).toEqual({
      sourceId: "jane@example.com",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
    })
    expect(result?.message).toMatchObject({
      sourceId: "<m1@example.com>",
      messageType: "incoming",
      contentType: "text",
      text: "Any update?",
      attachments: [],
    })
    expect(result?.message?.contentAttributes).toEqual({
      email: expect.objectContaining({
        subject: "Where is my order?",
        messageId: "<m1@example.com>",
        from: "jane@example.com",
        to: ["support@acme.test"],
      }),
    })
    expect(result?.postbackAction).toBeNull()
  })

  test("drops auto-replies so a bot never answers an out-of-office", async () => {
    const result = await receive([
      ...customerMail.slice(0, 4),
      "Auto-Submitted: auto-replied",
      ...customerMail.slice(4),
    ])
    expect(result).toBeNull()
  })

  test("drops mail from the inbox's own address (loop guard), case-insensitively", async () => {
    const result = await receive([
      "From: SUPPORT@acme.test",
      "Subject: copy",
      "Message-ID: <own@acme.test>",
      "Content-Type: text/plain",
      "",
      "my own sent copy",
    ])
    expect(result).toBeNull()
  })

  test("stores attachments and keeps the message when one fails to upload", async () => {
    storeIncomingImage
      .mockResolvedValueOnce({
        originPath: "ws/1/a",
        size: 8,
        mimeType: "application/pdf",
        url: "https://cdn/a",
      })
      .mockRejectedValueOnce(new Error("storage down"))

    const result = await receive([
      "From: jane@example.com",
      "Subject: files",
      "Message-ID: <m2@example.com>",
      'Content-Type: multipart/mixed; boundary="B"',
      "",
      "--B",
      "Content-Type: text/plain",
      "",
      "two files",
      "--B",
      'Content-Type: application/pdf; name="a.pdf"',
      'Content-Disposition: attachment; filename="a.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("%PDF-1.4").toString("base64"),
      "--B",
      'Content-Type: text/csv; name="b.csv"',
      'Content-Disposition: attachment; filename="b.csv"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("a,b").toString("base64"),
      "--B--",
      "",
    ])

    expect(result?.message?.text).toBe("two files")
    expect(result?.message?.attachments).toHaveLength(1)
    expect(result?.message?.attachments?.[0]).toMatchObject({
      name: "a.pdf",
      fileType: "file",
      url: "https://cdn/a",
    })
    expect(storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "original", acl: "public-read" }),
    )
  })

  test("rejects a payload that is not a base64 raw mail", async () => {
    await expect(
      receiveMessage({
        ctx,
        data: {
          integrationType: "smtp",
          integrationIdentifier: "inbox-1",
          payload: { nope: true },
        },
      } as never),
    ).rejects.toThrow()
  })
})
