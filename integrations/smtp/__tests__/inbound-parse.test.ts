import { describe, expect, test } from "vitest"
import { parseRawEmail } from "../src/inbound/parse"
import { stripQuotedReply } from "../src/inbound/quoted-reply"

const GENERATED_ID = /^<[0-9a-f]{64}@generated\.invalid>$/

const mail = (headers: string[], body: string) =>
  Buffer.from([...headers, "", body].join("\r\n"))

const base = [
  "From: Jane Doe <Jane@Example.com>",
  "To: support@acme.test",
  "Subject: Order 1234",
  "Message-ID: <abc@example.com>",
  "Date: Mon, 10 Nov 2026 10:00:00 +0000",
]

describe("parseRawEmail", () => {
  test("parses a plain mail: lowercase sender, display name, headers", async () => {
    const parsed = await parseRawEmail(
      mail(
        [
          ...base,
          "In-Reply-To: <prev@acme.test>",
          "References: <first@acme.test> <prev@acme.test>",
          "Content-Type: text/plain; charset=utf-8",
        ],
        "Hello there",
      ),
    )

    expect(parsed).toMatchObject({
      messageId: "<abc@example.com>",
      fromAddress: "jane@example.com",
      fromName: "Jane Doe",
      subject: "Order 1234",
      to: ["support@acme.test"],
      inReplyTo: "<prev@acme.test>",
      references: ["<first@acme.test>", "<prev@acme.test>"],
      text: "Hello there",
      isAutomated: false,
    })
  })

  test("derives text from an html-only mail", async () => {
    const parsed = await parseRawEmail(
      mail(
        [...base, "Content-Type: text/html; charset=utf-8"],
        "<p>Hi <b>team</b></p>",
      ),
    )

    expect(parsed?.text).toContain("Hi")
    expect(parsed?.text).toContain("team")
    expect(parsed?.text).not.toContain("<b>")
    expect(parsed?.html).toContain("<b>team</b>")
  })

  test("generates a stable Message-ID when the mail has none", async () => {
    const raw = mail(
      ["From: a@example.com", "Subject: x", "Content-Type: text/plain"],
      "no id",
    )
    const first = await parseRawEmail(raw)
    const second = await parseRawEmail(raw)

    expect(first?.messageId).toMatch(GENERATED_ID)
    expect(second?.messageId).toBe(first?.messageId)
  })

  test("returns null when there is no usable sender", async () => {
    expect(
      await parseRawEmail(
        mail(["Subject: x", "Content-Type: text/plain"], "b"),
      ),
    ).toBeNull()
  })

  test("keeps real attachments and drops inline (related) images", async () => {
    const raw = Buffer.from(
      [
        ...base,
        'Content-Type: multipart/mixed; boundary="B"',
        "",
        "--B",
        "Content-Type: text/plain",
        "",
        "see file",
        "--B",
        'Content-Type: application/pdf; name="invoice.pdf"',
        'Content-Disposition: attachment; filename="invoice.pdf"',
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from("%PDF-1.4").toString("base64"),
        "--B--",
        "",
      ].join("\r\n"),
    )

    const parsed = await parseRawEmail(raw)

    expect(parsed?.attachments).toHaveLength(1)
    expect(parsed?.attachments[0]).toMatchObject({
      filename: "invoice.pdf",
      contentType: "application/pdf",
    })
    expect(parsed?.attachments[0].content.toString()).toBe("%PDF-1.4")
  })

  describe("automated mail", () => {
    const parseWith = (header: string) =>
      parseRawEmail(
        mail([...base, header, "Content-Type: text/plain"], "I am away"),
      )

    test.each([
      "Auto-Submitted: auto-replied",
      "Precedence: bulk",
      "Precedence: auto_reply",
      "X-Auto-Response-Suppress: All",
      "List-Id: <news.example.com>",
    ])("flags %s", async (header) => {
      expect((await parseWith(header))?.isAutomated).toBe(true)
    })

    test("Auto-Submitted: no is a normal mail", async () => {
      expect((await parseWith("Auto-Submitted: no"))?.isAutomated).toBe(false)
    })

    test("flags bounce senders", async () => {
      const parsed = await parseRawEmail(
        mail(
          [
            "From: Mail Delivery <MAILER-DAEMON@mx.example.com>",
            "Subject: Undelivered",
            "Content-Type: text/plain",
          ],
          "failed",
        ),
      )
      expect(parsed?.isAutomated).toBe(true)
    })
  })
})

describe("stripQuotedReply", () => {
  test("cuts at 'On … wrote:'", () => {
    expect(
      stripQuotedReply(
        "Thanks, that works.\n\nOn Mon, 3 Nov 2026 at 10:00, Support <s@acme.test> wrote:\n> earlier text",
      ),
    ).toBe("Thanks, that works.")
  })

  test("cuts at a wrapped 'On … / wrote:'", () => {
    expect(
      stripQuotedReply(
        "Sounds good.\n\nOn Mon, 3 Nov 2026 at 10:00, Support <s@acme.test>\nwrote:\n> earlier",
      ),
    ).toBe("Sounds good.")
  })

  test("cuts at '-----Original Message-----'", () => {
    expect(
      stripQuotedReply("Yes.\n\n-----Original Message-----\nFrom: a\nSent: b"),
    ).toBe("Yes.")
  })

  test("cuts an Outlook From:/Sent: header block", () => {
    expect(
      stripQuotedReply(
        "Done.\n\nFrom: Support <s@acme.test>\nSent: Monday, 3 November 2026\nTo: me\nSubject: Re: x\n\nold",
      ),
    ).toBe("Done.")
  })

  test("cuts a trailing '>' quote block", () => {
    expect(stripQuotedReply("Agreed.\n> quoted 1\n> quoted 2")).toBe("Agreed.")
  })

  test("keeps interleaved '>' lines when new text follows them", () => {
    const text = "> point one\nMy answer to it\n> point two\nAnd to this one"
    expect(stripQuotedReply(text)).toBe(text)
  })

  test("never returns an empty message: falls back to the full text", () => {
    const text = "On Mon, 3 Nov 2026, A <a@b.c> wrote:\n> only quoted"
    expect(stripQuotedReply(text)).toBe(text)
  })

  test("leaves text without quotes untouched", () => {
    expect(stripQuotedReply("  just a message \n")).toBe("just a message")
  })
})
