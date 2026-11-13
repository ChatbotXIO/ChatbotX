import { describe, expect, test, vi } from "vitest"
import { parseRawEmail } from "../src/inbound/parse"
import {
  extractRawEmails,
  handleInboundWebhook,
  mailDedupKey,
  parseHeaderBlock,
} from "../src/inbound/webhook"

const JOB_ID = /^smtp-in-inbox-1-wh-[0-9a-f]{32}$/

const rawMail = [
  "From: Jane Doe <jane@example.com>",
  "To: support@acme.test",
  "Subject: Where is my order?",
  "Message-ID: <m1@example.com>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Any update?",
].join("\r\n")

const form = (fields: Record<string, string>) => {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value)
  }
  return new Request("https://app.test/hook", { method: "POST", body })
}

const json = (body: unknown) =>
  new Request("https://app.test/hook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describe("parseHeaderBlock", () => {
  test("lowercases names, unfolds continuations and keeps the first value", () => {
    const headers = parseHeaderBlock(
      "Message-ID: <a@b>\r\nReferences: <1@x>\r\n <2@x>\r\nmessage-id: <dup@b>",
    )
    expect(headers.get("message-id")).toBe("<a@b>")
    expect(headers.get("references")).toBe("<1@x> <2@x>")
  })
})

describe("extractRawEmails", () => {
  test("sendgrid raw mode passes the MIME source through untouched", async () => {
    const [raw] = await extractRawEmails("sendgrid", form({ email: rawMail }))
    expect(raw?.toString()).toBe(rawMail)
  })

  test("sendgrid parsed mode rebuilds a mail keeping Message-ID and threading", async () => {
    const [raw] = await extractRawEmails(
      "sendgrid",
      form({
        from: "Jane <jane@example.com>",
        to: "support@acme.test",
        subject: "Hello",
        text: "Body",
        headers: "Message-ID: <sg1@example.com>\nIn-Reply-To: <out1@acme.test>",
      }),
    )
    const mail = await parseRawEmail(raw as Buffer)
    expect(mail?.messageId).toBe("<sg1@example.com>")
    expect(mail?.inReplyTo).toBe("<out1@acme.test>")
    expect(mail?.fromAddress).toBe("jane@example.com")
    expect(mail?.text).toContain("Body")
  })

  test("sendgrid parsed mode keeps auto-reply headers so loop protection still works", async () => {
    const [raw] = await extractRawEmails(
      "sendgrid",
      form({
        from: "bot@example.com",
        to: "support@acme.test",
        subject: "Out of office",
        text: "I am away",
        headers: "Message-ID: <ooo@example.com>\nAuto-Submitted: auto-replied",
      }),
    )
    expect((await parseRawEmail(raw as Buffer))?.isAutomated).toBe(true)
  })

  test("mailgun prefers body-mime and otherwise composes from fields", async () => {
    const [mime] = await extractRawEmails(
      "mailgun",
      form({ "body-mime": rawMail }),
    )
    expect(mime?.toString()).toBe(rawMail)

    const [composed] = await extractRawEmails(
      "mailgun",
      form({
        from: "jane@example.com",
        recipient: "support@acme.test",
        subject: "Hi",
        "body-plain": "Hello",
        "message-headers": JSON.stringify([
          ["Message-Id", "<mg1@example.com>"],
        ]),
      }),
    )
    expect((await parseRawEmail(composed as Buffer))?.messageId).toBe(
      "<mg1@example.com>",
    )
  })

  test("postmark uses RawEmail, else rebuilds with base64 attachments", async () => {
    const [raw] = await extractRawEmails(
      "postmark",
      json({ RawEmail: rawMail }),
    )
    expect(raw?.toString()).toBe(rawMail)

    const [composed] = await extractRawEmails(
      "postmark",
      json({
        From: "jane@example.com",
        To: "support@acme.test",
        Subject: "With file",
        TextBody: "See attached",
        Headers: [{ Name: "Message-ID", Value: "<pm1@example.com>" }],
        Attachments: [
          {
            Name: "a.txt",
            ContentType: "text/plain",
            Content: Buffer.from("file body").toString("base64"),
          },
        ],
      }),
    )
    const mail = await parseRawEmail(composed as Buffer)
    expect(mail?.messageId).toBe("<pm1@example.com>")
    expect(mail?.attachments).toHaveLength(1)
  })

  test("brevo yields one mail per item", async () => {
    const mails = await extractRawEmails(
      "brevo",
      json({
        items: [
          {
            MessageId: "<b1@example.com>",
            From: { Name: "Jane", Address: "jane@example.com" },
            To: [{ Address: "support@acme.test" }],
            Subject: "One",
            RawTextBody: "First",
          },
          {
            MessageId: "<b2@example.com>",
            From: { Address: "joe@example.com" },
            To: [{ Address: "support@acme.test" }],
            Subject: "Two",
            RawTextBody: "Second",
          },
        ],
      }),
    )
    expect(mails).toHaveLength(2)
    expect((await parseRawEmail(mails[1] as Buffer))?.messageId).toBe(
      "<b2@example.com>",
    )
  })

  test("a mail without a sender is rejected as a bad request", async () => {
    await expect(
      extractRawEmails("postmark", json({ Subject: "no from" })),
    ).rejects.toMatchObject({ httpStatusCode: 400 })
  })

  test("invalid JSON is rejected as a bad request", async () => {
    await expect(
      extractRawEmails(
        "brevo",
        new Request("https://app.test/hook", { method: "POST", body: "nope" }),
      ),
    ).rejects.toMatchObject({ httpStatusCode: 400 })
  })

  test("a body over the cap is refused even with no Content-Length", async () => {
    const big = new Uint8Array(16 * 1024 * 1024)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big)
        controller.close()
      },
    })
    const request = new Request("https://app.test/hook", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit)
    await expect(extractRawEmails("postmark", request)).rejects.toMatchObject({
      httpStatusCode: 413,
    })
  })

  test("a Brevo batch above the per-request mail cap is refused", async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      MessageId: `<b${index}@example.com>`,
      From: { Address: "jane@example.com" },
      Subject: "x",
      RawTextBody: "x",
    }))
    await expect(
      extractRawEmails("brevo", json({ items })),
    ).rejects.toMatchObject({ httpStatusCode: 413 })
  })

  test("an oversized request is refused before it is read", async () => {
    const request = new Request("https://app.test/hook", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024) },
      body: "x",
    })
    await expect(extractRawEmails("postmark", request)).rejects.toMatchObject({
      httpStatusCode: 413,
    })
  })
})

describe("mailDedupKey", () => {
  test("is derived from the Message-ID, so a retried delivery maps to one job", async () => {
    const other = Buffer.from(`${rawMail}\r\nextra`)
    expect(await mailDedupKey(Buffer.from(rawMail))).toBe(
      await mailDedupKey(other),
    )
  })
})

describe("handleInboundWebhook", () => {
  test("enqueues each mail as an incomingMessage job for the inbox", async () => {
    const queue = { add: vi.fn() }

    const result = await handleInboundWebhook({
      config: { inboxId: "inbox-1", provider: "postmark" },
      req: json({ RawEmail: rawMail }),
      queue,
    })

    expect(result).toBe("ok")
    expect(queue.add).toHaveBeenCalledTimes(1)
    const [name, payload, options] = queue.add.mock.calls[0] as [
      string,
      { data: Record<string, unknown> },
      { jobId: string },
    ]
    expect(name).toBe("incomingMessage")
    expect(payload.data).toMatchObject({
      integrationType: "smtp",
      integrationIdentifier: "inbox-1",
      payload: { raw: Buffer.from(rawMail).toString("base64") },
    })
    expect(options.jobId).toMatch(JOB_ID)
  })

  test("acknowledges without enqueueing when the request carries no mail", async () => {
    const queue = { add: vi.fn() }
    const result = await handleInboundWebhook({
      config: { inboxId: "inbox-1", provider: "brevo" },
      req: json({ items: [] }),
      queue,
    })
    expect(result).toBe("ok")
    expect(queue.add).not.toHaveBeenCalled()
  })
})
