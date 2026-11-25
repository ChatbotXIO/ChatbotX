import { z } from "zod"
import {
  type ContentTypeRule,
  type PartsRule,
  POST_PUBLISHING_RULES,
  ruleFor,
} from "./post-publishing-rules"
import type { SocialContentType, SocialProvider } from "./social-account"
import type { SocialMediaKind, SocialPostPartKind } from "./social-post"

/** Machine-readable reasons a target cannot be published as composed. */
export const postIssueCodes = z.enum([
  "contentTypeNotSupported",
  "contentTypeDisabled",
  "textRequired",
  "textTooLong",
  "linkNotSupported",
  "linkRequired",
  "tooManyLinks",
  "mediaTooFew",
  "mediaTooMany",
  "mediaKindNotAllowed",
  "mediaFormatNotSupported",
  "mediaTooLarge",
  "mediaTooShort",
  "mediaTooLong",
  "optionsInvalid",
  "partsNotSupported",
  "firstCommentNotSupported",
  "tooManyParts",
  "partTextRequired",
  "partTextTooLong",
  // Not emitted by the rules: the service adds them for a destination that
  // cannot publish.
  "destinationNotFound",
  "destinationInactive",
  "accountNeedsReauth",
  "accountDisconnected",
  "inboxDisconnected",
  "inboxNeedsReconnect",
  "publishPermissionMissing",
])
export type PostIssueCode = z.infer<typeof postIssueCodes>

/** Which part of the target an issue is about. */
export const postIssueFields = z.enum([
  "contentType",
  "text",
  "linkUrl",
  "media",
  "options",
  "destination",
])
export type PostIssueField = z.infer<typeof postIssueFields>

/** The field of a follow-up part an issue is about: `parts[2].text`, `firstComment.text`, or `parts` (the list). */
export type PartIssueField =
  | `parts[${number}].text`
  | "firstComment.text"
  | "parts"

export type PostIssue = {
  code: PostIssueCode
  field: PostIssueField
  message: string
}

/** What the publisher knows about one media file. Unknown values are not checked. */
export type MediaSpec = {
  durationMs: number | null
  kind: SocialMediaKind
  mimeType: string | null
  size: number | null
}

/** Content type a target gets when the caller names none: what the files and link suggest. */
export const inferContentType = (input: {
  hasLink: boolean
  media: readonly MediaSpec[]
  provider: SocialProvider
}): SocialContentType => {
  const [first] = input.media
  if (!first) {
    return input.hasLink && input.provider === "facebook" ? "link" : "text"
  }
  if (input.media.length > 1) {
    return "carousel"
  }
  if (first.kind === "image") {
    return "image"
  }
  return input.provider === "instagram" ? "reel" : "video"
}

/** One destination's effective content, after its own overrides are applied. */
export type PublishTargetInput = {
  contentType: SocialContentType
  linkUrl: string | null
  media: readonly MediaSpec[]
  options: unknown
  provider: SocialProvider
  text: string | null
}

export type NormalisedTarget = {
  issues: PostIssue[]
  linkUrl: string | null
  media: readonly MediaSpec[]
  /** The options with defaults applied; `{}` when they were invalid. */
  options: Record<string, boolean | string | number>
  text: string | null
}

const issue = (
  code: PostIssueCode,
  field: PostIssueField,
  message: string,
): PostIssue => ({ code, field, message })

const SECONDS_PER_MILLISECOND = 1000

const validateMedia = (
  rule: ContentTypeRule,
  media: readonly MediaSpec[],
): PostIssue[] => {
  const issues: PostIssue[] = []
  if (media.length < rule.minMedia) {
    issues.push(
      issue("mediaTooFew", "media", `Add at least ${rule.minMedia} file(s).`),
    )
  }
  if (media.length > rule.maxMedia) {
    issues.push(
      issue(
        "mediaTooMany",
        "media",
        `At most ${rule.maxMedia} file(s) allowed.`,
      ),
    )
  }
  for (const file of media) {
    const allowed = rule.media.find((candidate) => candidate.kind === file.kind)
    if (!allowed) {
      issues.push(
        issue(
          "mediaKindNotAllowed",
          "media",
          `A ${file.kind} is not allowed here.`,
        ),
      )
      continue
    }
    if (
      allowed.mimeTypes &&
      file.mimeType &&
      !allowed.mimeTypes.includes(file.mimeType)
    ) {
      issues.push(
        issue(
          "mediaFormatNotSupported",
          "media",
          `${file.mimeType} is not supported; use ${allowed.mimeTypes.join(", ")}.`,
        ),
      )
    }
    if (
      allowed.maxBytes !== null &&
      file.size !== null &&
      file.size > allowed.maxBytes
    ) {
      issues.push(
        issue(
          "mediaTooLarge",
          "media",
          "A file is larger than the network allows.",
        ),
      )
    }
    if (file.durationMs !== null) {
      const seconds = file.durationMs / SECONDS_PER_MILLISECOND
      if (
        allowed.minDurationSeconds !== null &&
        seconds < allowed.minDurationSeconds
      ) {
        issues.push(
          issue(
            "mediaTooShort",
            "media",
            "A video is shorter than the network allows.",
          ),
        )
      }
      if (
        allowed.maxDurationSeconds !== null &&
        seconds > allowed.maxDurationSeconds
      ) {
        issues.push(
          issue(
            "mediaTooLong",
            "media",
            "A video is longer than the network allows.",
          ),
        )
      }
    }
  }
  return issues
}

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u
const UTF8_ENCODER = new TextEncoder()

/**
 * Length of a Threads text: 500 characters, where an emoji counts as its number
 * of UTF-8 bytes (the posts reference says so, and points at the
 * grapheme-splitter package for the splitting). Every other character counts as
 * one.
 */
export const threadsTextLength = (text: string): number => {
  let length = 0
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(text)) {
    length += EMOJI_PATTERN.test(segment)
      ? UTF8_ENCODER.encode(segment).length
      : 1
  }
  return length
}

/** A text's length in the unit its network counts. */
export const measureText = (provider: SocialProvider, text: string): number =>
  POST_PUBLISHING_RULES[provider].textUnit === "threadsUtf8Emoji"
    ? threadsTextLength(text)
    : text.length

/** The follow-up parts a network offers, or `null`. */
export const partsRuleFor = (provider: SocialProvider): PartsRule | null =>
  POST_PUBLISHING_RULES[provider].parts

/** One follow-up part as composed. */
export type PartInput = { kind: SocialPostPartKind; text: string }

export type PartIssue = {
  code: PostIssueCode
  field: PartIssueField
  message: string
  /** Index in the list of parts as given (thread parts first, the first comment last). */
  partIndex: number
}

/**
 * Applies a network's rules to the follow-up parts of one target. Thread parts
 * come first (in order), the first comment last; the issue's `partIndex` is the
 * index in that list and its field names what to fix.
 */
export const validateParts = (
  provider: SocialProvider,
  parts: readonly PartInput[],
): PartIssue[] => {
  if (parts.length === 0) {
    return []
  }
  const rule = partsRuleFor(provider)
  const threadParts = parts.filter((part) => part.kind === "threadPart")
  const hasComment = parts.some((part) => part.kind === "firstComment")
  const issues: PartIssue[] = []
  const add = (
    code: PostIssueCode,
    field: PartIssueField,
    message: string,
    partIndex: number,
  ): void => {
    issues.push({ code, field, message, partIndex })
  }
  if (!rule) {
    if (threadParts.length > 0) {
      add(
        "partsNotSupported",
        "parts",
        `${provider} does not publish thread parts.`,
        0,
      )
    }
    if (hasComment) {
      add(
        "firstCommentNotSupported",
        "firstComment.text",
        `${provider} does not publish a first comment.`,
        threadParts.length,
      )
    }
    return issues
  }
  if (hasComment && !rule.firstComment) {
    add(
      "firstCommentNotSupported",
      "firstComment.text",
      `${provider} does not publish a first comment.`,
      threadParts.length,
    )
  }
  if (parts.length > rule.maxParts) {
    add(
      "tooManyParts",
      "parts",
      `At most ${rule.maxParts} parts.`,
      rule.maxParts,
    )
  }
  for (const [index, part] of parts.entries()) {
    const field: PartIssueField =
      part.kind === "firstComment"
        ? "firstComment.text"
        : `parts[${index}].text`
    const text = part.text.trim()
    const maxLinks = POST_PUBLISHING_RULES[provider].maxLinks
    if (maxLinks !== null && countUniqueLinks(text) > maxLinks) {
      add("tooManyLinks", field, `At most ${maxLinks} links per part.`, index)
    }
    if (text.length === 0) {
      add("partTextRequired", field, "Text is required.", index)
    } else if (
      rule.maxPartChars !== null &&
      measureText(provider, text) > rule.maxPartChars
    ) {
      add(
        "partTextTooLong",
        field,
        `At most ${rule.maxPartChars} characters.`,
        index,
      )
    }
  }
  return issues
}

const LINK_PROTOCOL = /^https?:\/\//i
/** A link token: `http(s)://…` or a bare `www.…`, up to the next whitespace. */
const LINK_TOKEN = /(?<![\w@/.-])(?:https?:\/\/|www\.)[^\s]+/gi
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"'’”]+$/
const LINK_PARTS = /^(https?:\/\/)?([^/?#]*)(.*)$/i

/**
 * The identity of a link for counting: scheme and host are case-insensitive,
 * the path and query are not.
 */
const linkKey = (token: string): string => {
  const [, scheme = "", host = "", rest = ""] = LINK_PARTS.exec(token) ?? []
  return `${scheme.toLowerCase()}${host.toLowerCase()}${rest}`
}

/**
 * Unique links in a text, counted the way Threads documents it ("all unique
 * URLs found in the text field are counted", bare `www.` links included,
 * docs/threads/posts): `http(s)://` and `www.` tokens, trailing punctuation
 * stripped, duplicates collapsed on scheme and host without case.
 */
export const countUniqueLinks = (text: string): number =>
  new Set(
    (text.match(LINK_TOKEN) ?? [])
      .map((token) => token.replace(TRAILING_PUNCTUATION, ""))
      .filter((token) => token.length > 0)
      .map(linkKey),
  ).size

const CAPTION_LINK_SEPARATOR = "\n\n"

/**
 * The text a target publishes. A content type without a structured link field
 * carries the link at the end of its caption (after a blank line), unless the
 * caption already contains that exact URL. A type with a structured link
 * (`supportsLink`) keeps its text untouched. Compose, preview and publish all
 * use this one function.
 */
export const captionWithLink = (input: {
  linkUrl: string | null | undefined
  supportsLink: boolean
  text: string | null | undefined
}): string | null => {
  const text = input.text?.trim() ? input.text.trim() : null
  const linkUrl = input.linkUrl?.trim() ? input.linkUrl.trim() : null
  if (input.supportsLink || !linkUrl) {
    return text
  }
  if (!text) {
    return linkUrl
  }
  return text.includes(linkUrl)
    ? text
    : `${text}${CAPTION_LINK_SEPARATOR}${linkUrl}`
}

/** `true` when the link of this type goes into the caption (the type has a text but no link field). */
export const linkGoesInCaption = (rule: ContentTypeRule): boolean =>
  !rule.supportsLink && rule.text.maxLength !== 0

/**
 * Applies a content type's rules to one target and returns its normalised
 * content with every issue found. The composer, `validate`, `preview` and the
 * publisher all call this, so they cannot disagree.
 */
export const normalisePublishTarget = (
  input: PublishTargetInput,
): NormalisedTarget => {
  const text = input.text?.trim() ? input.text.trim() : null
  const linkUrl = input.linkUrl?.trim() ? input.linkUrl.trim() : null
  const base: NormalisedTarget = {
    issues: [],
    linkUrl,
    media: input.media,
    options: {},
    text,
  }
  const rule = ruleFor(input.provider, input.contentType)
  if (!rule) {
    return {
      ...base,
      issues: [
        issue(
          "contentTypeNotSupported",
          "contentType",
          `${input.provider} does not publish ${input.contentType}.`,
        ),
      ],
    }
  }
  if (!rule.enabled) {
    return {
      ...base,
      issues: [
        issue(
          "contentTypeDisabled",
          "contentType",
          "This content type is not available yet.",
        ),
      ],
    }
  }

  const inCaption = linkGoesInCaption(rule)
  const effectiveText = inCaption
    ? captionWithLink({ linkUrl, supportsLink: false, text })
    : text
  const issues: PostIssue[] = []
  if (rule.text.required && !effectiveText && !(rule.supportsLink && linkUrl)) {
    issues.push(issue("textRequired", "text", "Text is required."))
  }
  if (
    rule.text.maxLength !== null &&
    effectiveText &&
    measureText(input.provider, effectiveText) > rule.text.maxLength
  ) {
    issues.push(
      issue(
        "textTooLong",
        "text",
        rule.text.maxLength === 0
          ? "This content type carries no text."
          : `At most ${rule.text.maxLength} characters.`,
      ),
    )
  }
  const maxLinks = POST_PUBLISHING_RULES[input.provider].maxLinks
  if (
    maxLinks !== null &&
    effectiveText &&
    countUniqueLinks(effectiveText) > maxLinks
  ) {
    issues.push(
      issue("tooManyLinks", "text", `At most ${maxLinks} links in the text.`),
    )
  }
  // Only a type that carries no text at all (a story) cannot take a link.
  if (linkUrl && !rule.supportsLink && !inCaption) {
    issues.push(
      issue("linkNotSupported", "linkUrl", "A link is not supported here."),
    )
  }
  if (input.contentType === "link" && !linkUrl) {
    issues.push(issue("linkRequired", "linkUrl", "A link is required."))
  }
  if (
    linkUrl &&
    (rule.supportsLink || inCaption) &&
    !LINK_PROTOCOL.test(linkUrl)
  ) {
    issues.push(
      issue(
        "linkRequired",
        "linkUrl",
        "The link must start with http:// or https://.",
      ),
    )
  }
  issues.push(...validateMedia(rule, input.media))

  const parsed = rule.optionsSchema.safeParse(input.options ?? {})
  if (!parsed.success) {
    // One issue per setting, named by its key, so the composer can point at it.
    const keys = [
      ...new Set(
        parsed.error.issues.map(
          (problem) => problem.path.join(".") || "options",
        ),
      ),
    ]
    for (const key of keys) {
      issues.push(
        issue("optionsInvalid", "options", `The setting "${key}" is invalid.`),
      )
    }
  }
  return {
    ...base,
    issues,
    // The link already sits in the caption: the publisher sends no separate one.
    linkUrl: inCaption ? null : linkUrl,
    options: parsed.success ? parsed.data : {},
    text: effectiveText,
  }
}
