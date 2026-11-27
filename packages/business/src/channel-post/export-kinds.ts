import { ChatbotXException } from "../errors"

/** The kinds that read the comments of posts. */
export const channelPostCommentExportKinds = [
  "comments",
  "phones",
  "emails",
] as const
export type ChannelPostCommentExportKind =
  (typeof channelPostCommentExportKinds)[number]

/**
 * `comments`, `phones` and `emails` read the comments of the given posts;
 * `rows` writes the post list itself (one row per post) for a set of list
 * filters.
 */
export const channelPostExportKinds = [
  ...channelPostCommentExportKinds,
  "rows",
] as const
export type ChannelPostExportKind = (typeof channelPostExportKinds)[number]

/** Narrows a stored kind string to a comment kind (from the same list as the type). */
export const isChannelPostCommentExportKind = (
  kind: string | undefined,
): kind is ChannelPostCommentExportKind =>
  (channelPostCommentExportKinds as readonly string[]).includes(kind ?? "")

type ChannelPostExportKindConfig = {
  header: readonly string[]
  /** The kind lists contact data: refused to a caller who may not view email and phone. */
  requiresEmailAndPhone: boolean
}

const COMMENTS_HEADER = [
  "createdAt",
  "post",
  "customer",
  "phone",
  "text",
  "hidden",
] as const
const PHONES_HEADER = ["customer", "phone", "firstCommentAt", "post"] as const
const EMAILS_HEADER = ["customer", "email", "firstCommentAt", "post"] as const
export const ROWS_HEADER = [
  "publishedAt",
  "channel",
  "page",
  "type",
  "text",
  "comments",
  "reactions",
  "shares",
  "phones",
  "topics",
  "author",
  "link",
  "externalPostId",
] as const

/** Per kind: its CSV header and the permission it needs. */
export const CHANNEL_POST_EXPORT_KINDS: Record<
  ChannelPostExportKind,
  ChannelPostExportKindConfig
> = {
  comments: { header: COMMENTS_HEADER, requiresEmailAndPhone: false },
  emails: { header: EMAILS_HEADER, requiresEmailAndPhone: true },
  phones: { header: PHONES_HEADER, requiresEmailAndPhone: true },
  rows: { header: ROWS_HEADER, requiresEmailAndPhone: false },
}

/** The refusal of a kind the caller may not export: contact data needs the email-and-phone permission. */
export const forbiddenException = (): ChatbotXException =>
  new ChatbotXException(
    "Phone numbers and emails are not available to this caller.",
    "FORBIDDEN",
    403,
  )

/** Whether a caller may export `kind`: contact data needs the email-and-phone permission. */
export const mayExportKind = (
  kind: ChannelPostExportKind,
  canViewEmailAndPhone: boolean,
): boolean =>
  canViewEmailAndPhone || !CHANNEL_POST_EXPORT_KINDS[kind].requiresEmailAndPhone
