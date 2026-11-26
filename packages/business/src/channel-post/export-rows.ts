import type { ChannelPostComment } from "@chatbotx.io/sdk"
import type { CsvCell } from "@chatbotx.io/utils/csv"
import { findEmail } from "@chatbotx.io/utils/find-email"
import {
  findPhoneNumber,
  redactPhoneNumbers,
} from "@chatbotx.io/utils/has-phone-number"
import type { PostCommentItem } from "./comments.service"
import type { ChannelPostCommentExportKind } from "./export-kinds"

/**
 * What one comment adds to an export. `key` is the value the kind deduplicates
 * on (`null`: every comment is a row); `at` is when the comment was written, so
 * the row kept for a key is the one of its first comment.
 */
export type ExportRow = {
  at: Date | null
  key: string | null
  row: CsvCell[]
}

// ── Source `stored`: comments read from the message table ───────────────────

type StoredRowContext = {
  /** The contact's email; `null` when the caller may not see it or the contact has none. */
  contactEmail: string | null
  /** What the file calls the post (its caption, else its channel id). */
  postLabel: string
}

/** The customer's name, or the page's own name for a reply the page sent. */
const storedCustomer = (comment: PostCommentItem): string =>
  comment.page?.name ?? comment.author?.name ?? comment.author?.id ?? ""

/** A page reply carries no phone of its own: the contact's number belongs to the customer. */
const storedContactPhone = (comment: PostCommentItem): string =>
  comment.sender === "page" ? "" : (comment.author?.phoneNumber ?? "")

/** A comment's contact phone, else the number the customer wrote in the comment. */
const storedPhone = (comment: PostCommentItem): string =>
  comment.author?.phoneNumber ?? findPhoneNumber(comment.text ?? "") ?? ""

const storedEmail = (
  comment: PostCommentItem,
  context: StoredRowContext,
): string | null => {
  const email = context.contactEmail ?? findEmail(comment.text ?? "")
  return email === null ? null : email.toLowerCase()
}

type StoredRowBuilder = (
  comment: PostCommentItem,
  context: StoredRowContext,
) => ExportRow | null

/** Only a customer's comment counts for contact data: a page reply is not their number or email. */
export const STORED_ROW_BUILDERS: Record<
  ChannelPostCommentExportKind,
  StoredRowBuilder
> = {
  comments: (comment, { postLabel }) => ({
    at: comment.createdAt,
    key: null,
    row: [
      comment.createdAt.toISOString(),
      postLabel,
      storedCustomer(comment),
      storedContactPhone(comment),
      comment.text,
      comment.hidden ? "true" : "false",
    ],
  }),
  emails: (comment, context) => {
    const email = storedEmail(comment, context)
    if (comment.sender !== "contact" || email === null) {
      return null
    }
    return {
      at: comment.createdAt,
      key: email,
      row: [
        storedCustomer(comment),
        email,
        comment.createdAt.toISOString(),
        context.postLabel,
      ],
    }
  },
  phones: (comment, { postLabel }) =>
    comment.sender === "contact"
      ? {
          at: comment.createdAt,
          key: comment.author?.id ?? comment.id,
          row: [
            storedCustomer(comment),
            storedPhone(comment),
            comment.createdAt.toISOString(),
            postLabel,
          ],
        }
      : null,
}

// ── Source `channel`: comments read from the channel's own API ──────────────

type ChannelRowContext = {
  /** May the caller see phone numbers? Without it the text is masked, like the stored read. */
  canViewEmailAndPhone: boolean
  postLabel: string
}

const channelCustomer = (comment: ChannelPostComment): string =>
  comment.author.name ?? comment.author.id ?? ""

/** `true`/`false` when the channel says; blank when it does not (never a guessed "false"). */
const hiddenCell = (hidden: boolean | null): string => {
  if (hidden === null) {
    return ""
  }
  return hidden ? "true" : "false"
}

/** The text as the caller may see it: phone numbers masked without the permission. */
const channelText = (
  comment: ChannelPostComment,
  context: ChannelRowContext,
): string =>
  context.canViewEmailAndPhone ? comment.text : redactPhoneNumbers(comment.text)

type ChannelRowBuilder = (
  comment: ChannelPostComment,
  context: ChannelRowContext,
) => ExportRow | null

/**
 * The channel's API has no contact phone or email: `phones` and `emails` hold
 * only what was typed in a comment, and a reply the page's own account wrote
 * is skipped.
 */
export const CHANNEL_ROW_BUILDERS: Record<
  ChannelPostCommentExportKind,
  ChannelRowBuilder
> = {
  comments: (comment, context) => {
    const text = channelText(comment, context)
    return {
      at: comment.createdAt,
      key: null,
      row: [
        comment.createdAt?.toISOString() ?? "",
        context.postLabel,
        channelCustomer(comment),
        context.canViewEmailAndPhone ? (findPhoneNumber(text) ?? "") : "",
        text,
        hiddenCell(comment.hidden),
      ],
    }
  },
  emails: (comment, context) => {
    const found = comment.fromOwner === true ? null : findEmail(comment.text)
    if (found === null) {
      return null
    }
    const email = found.toLowerCase()
    return {
      at: comment.createdAt,
      key: email,
      row: [
        channelCustomer(comment),
        email,
        comment.createdAt?.toISOString() ?? "",
        context.postLabel,
      ],
    }
  },
  phones: (comment, context) => {
    const phone =
      comment.fromOwner === true ? null : findPhoneNumber(comment.text)
    if (phone === null) {
      return null
    }
    return {
      at: comment.createdAt,
      key: phone,
      row: [
        channelCustomer(comment),
        phone,
        comment.createdAt?.toISOString() ?? "",
        context.postLabel,
      ],
    }
  },
}

/**
 * Keeps, per key, the row of the earliest comment (a comment with no time
 * counts as the latest).
 */
export const keepEarliestRow = (
  rows: Map<string, ExportRow>,
  entry: ExportRow & { key: string },
): void => {
  const kept = rows.get(entry.key)
  const isEarlier =
    kept !== undefined &&
    entry.at !== null &&
    (kept.at === null || entry.at < kept.at)
  if (kept === undefined || isEarlier) {
    rows.set(entry.key, entry)
  }
}
