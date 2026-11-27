import { describe, expect, test } from "vitest"
import {
  CHANNEL_POST_EXPORT_KINDS,
  channelPostCommentExportKinds,
  channelPostExportKinds,
  isChannelPostCommentExportKind,
  mayExportKind,
} from "../src/channel-post/export-kinds"
import {
  CHANNEL_ROW_BUILDERS,
  type ExportRow,
  keepEarliestRow,
} from "../src/channel-post/export-rows"

const comment = (overrides: Record<string, unknown> = {}) => ({
  author: { id: "a1", name: "An" },
  createdAt: new Date("2026-11-22T10:00:00.000Z"),
  fromOwner: false,
  hidden: false,
  id: "c1",
  parentId: null,
  text: "hello",
  ...overrides,
})

const context = { canViewEmailAndPhone: true, postLabel: "Flash sale" }

describe("export kinds config", () => {
  test("every kind has a header, in the stored comments CSV's column order", () => {
    expect(channelPostExportKinds).toEqual([
      "comments",
      "phones",
      "emails",
      "rows",
    ])
    expect(CHANNEL_POST_EXPORT_KINDS.comments.header).toEqual([
      "createdAt",
      "post",
      "customer",
      "phone",
      "text",
      "hidden",
    ])
    expect(CHANNEL_POST_EXPORT_KINDS.phones.header).toEqual([
      "customer",
      "phone",
      "firstCommentAt",
      "post",
    ])
    expect(CHANNEL_POST_EXPORT_KINDS.emails.header).toEqual([
      "customer",
      "email",
      "firstCommentAt",
      "post",
    ])
    expect(CHANNEL_POST_EXPORT_KINDS.rows.header).toHaveLength(13)
  })

  test("the comment-kind guard follows the shared list: every comment kind, never rows or junk", () => {
    expect(
      channelPostCommentExportKinds.every(isChannelPostCommentExportKind),
    ).toBe(true)
    expect(isChannelPostCommentExportKind("rows")).toBe(false)
    expect(isChannelPostCommentExportKind("other")).toBe(false)
    expect(isChannelPostCommentExportKind(undefined)).toBe(false)
  })

  test("only the contact-data kinds need the email-and-phone permission", () => {
    expect(
      channelPostExportKinds.filter((kind) => !mayExportKind(kind, false)),
    ).toEqual(["phones", "emails"])
    expect(
      channelPostExportKinds.every((kind) => mayExportKind(kind, true)),
    ).toBe(true)
  })
})

describe("channel row builders", () => {
  test("comments: one row per comment in the stored column order", () => {
    const entry = CHANNEL_ROW_BUILDERS.comments(
      comment({ hidden: true, text: "call 0901234567" }),
      context,
    )

    expect(entry).toMatchObject({
      key: null,
      row: [
        "2026-11-22T10:00:00.000Z",
        "Flash sale",
        "An",
        "0901234567",
        "call 0901234567",
        "true",
      ],
    })
  })

  test("comments: without the permission the text is masked and the phone column blank", () => {
    const entry = CHANNEL_ROW_BUILDERS.comments(
      comment({ text: "call 0901234567" }),
      { ...context, canViewEmailAndPhone: false },
    )

    expect(entry?.row[3]).toBe("")
    expect(String(entry?.row[4])).not.toContain("0901234567")
  })

  test("comments: unknown time, name and hidden flag degrade to blanks", () => {
    const entry = CHANNEL_ROW_BUILDERS.comments(
      comment({
        author: { id: "a9", name: null },
        createdAt: null,
        hidden: null,
      }),
      context,
    )

    expect(entry?.row[0]).toBe("")
    expect(entry?.row[2]).toBe("a9")
    expect(entry?.row[5]).toBe("")
  })

  test.each([
    [true, "true"],
    [false, "false"],
    [null, ""],
  ] as const)("comments: hidden %s is written as %j", (hidden, cell) => {
    expect(
      CHANNEL_ROW_BUILDERS.comments(comment({ hidden }), context)?.row[5],
    ).toBe(cell)
  })

  test("emails: lower-cases the first address in the text and keys on it", () => {
    const entry = CHANNEL_ROW_BUILDERS.emails(
      comment({ text: "write Binh@Shop.VN or b@x.io" }),
      context,
    )

    expect(entry).toMatchObject({
      key: "binh@shop.vn",
      row: ["An", "binh@shop.vn", "2026-11-22T10:00:00.000Z", "Flash sale"],
    })
  })

  test("emails: a comment without an address, or from the page itself, adds nothing", () => {
    expect(CHANNEL_ROW_BUILDERS.emails(comment(), context)).toBeNull()
    expect(
      CHANNEL_ROW_BUILDERS.emails(
        comment({ fromOwner: true, text: "mail shop@x.io" }),
        context,
      ),
    ).toBeNull()
  })

  test("emails: an unknown owner flag still counts as a customer", () => {
    expect(
      CHANNEL_ROW_BUILDERS.emails(
        comment({ fromOwner: null, text: "a@x.io" }),
        context,
      ),
    ).not.toBeNull()
  })

  test("phones: the number written in the text, skipping the page's own replies", () => {
    expect(
      CHANNEL_ROW_BUILDERS.phones(
        comment({ text: "my number 0912 345 678 ok" }),
        context,
      ),
    ).toMatchObject({ key: "0912 345 678" })
    expect(
      CHANNEL_ROW_BUILDERS.phones(
        comment({ fromOwner: true, text: "call 0912345678" }),
        context,
      ),
    ).toBeNull()
    expect(CHANNEL_ROW_BUILDERS.phones(comment(), context)).toBeNull()
  })
})

describe("keepEarliestRow", () => {
  const entry = (
    key: string,
    at: string | null,
  ): ExportRow & { key: string } => ({
    at: at ? new Date(at) : null,
    key,
    row: [key, at],
  })

  test("keeps the row of the earliest comment per key", () => {
    const rows = new Map<string, ExportRow>()

    keepEarliestRow(rows, entry("a", "2026-11-22T12:00:00.000Z"))
    keepEarliestRow(rows, entry("a", "2026-11-22T09:00:00.000Z"))
    keepEarliestRow(rows, entry("a", "2026-11-22T11:00:00.000Z"))

    expect(rows.get("a")?.row[1]).toBe("2026-11-22T09:00:00.000Z")
  })

  test("a comment with no time never replaces one that has a time", () => {
    const rows = new Map<string, ExportRow>()
    keepEarliestRow(rows, entry("a", "2026-11-22T09:00:00.000Z"))
    keepEarliestRow(rows, entry("a", null))
    expect(rows.get("a")?.row[1]).toBe("2026-11-22T09:00:00.000Z")

    keepEarliestRow(rows, entry("b", null))
    keepEarliestRow(rows, entry("b", "2026-11-22T09:00:00.000Z"))
    expect(rows.get("b")?.row[1]).toBe("2026-11-22T09:00:00.000Z")
  })
})
