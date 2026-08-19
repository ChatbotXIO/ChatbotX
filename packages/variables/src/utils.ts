import {
  appointmentService,
  buildAppointmentUrl,
  conversationService,
  messageService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import {
  languageFromLocale,
  normalizeStoredTimezone,
  offsetFromStoredTimezone,
} from "@chatbotx.io/business/contact-locale"
import { resolveGenderLabel } from "@chatbotx.io/business/system-field"
import { isWorkspaceScheduledForDeletion } from "@chatbotx.io/business/workspace-lifecycle/predicates"
import {
  type ContactSource,
  contactSources,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import type { MessageModel } from "@chatbotx.io/database/types"
import { signAppointmentScheduleToken } from "@chatbotx.io/encryption"
import { signUserHash } from "@chatbotx.io/encryption/user-hash"
import {
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  DEFAULT_FILTER_TIMEZONE,
  formatCustomFieldValueInTimeZone,
  formatWithFallback,
} from "@chatbotx.io/utils/datetime"
import { isCouponVariable, resolveCouponVariable } from "./coupon-variable"
import {
  getAssignedTeamName,
  resolveAssigneeEmail,
  resolveAssigneeId,
  resolveAssigneeName,
} from "./helpers/assigned"
import {
  findPrimaryContactChannel,
  getLatestContactNoteString,
  listContactNotesString,
  listContactTagsString,
} from "./helpers/contact"
import {
  getIntegrationField,
  getLastCommentedPostText,
} from "./helpers/integration-fields"
import {
  getContactLastInput,
  getContactLastInputType,
} from "./helpers/last-input"
import { getChatHistory } from "./helpers/message"
import { getQueuedMessages } from "./helpers/queued-messages"
import { toPublicStorageUrl } from "./helpers/storage-url"
import { logger } from "./logger"
import type {
  ContactCustomFieldValue,
  ContactVariableContext,
  ReplaceVariableProps,
} from "./schema"

const LOCALE_SEPARATOR_RE = /[-_]/
const VARIABLE_PLACEHOLDER_REGEX =
  /\{\{(coupon:[^{}\n]+|raw:[^{}\n]+|[^{}\n]+)\}\}/g
// `{{gender}}` renders a salutation ("Anh" / "anh"), so its case depends on
// where the placeholder sits — a call the position-independent mapping can't
// make. resolveGenderLabel returns the opening form; inside a sentence it is
// that label lowercased.
const SENTENCE_CASED_VARIABLES = new Set<string>([systemFieldTypes.enum.gender])

// The text before a placeholder that opens the message, a line, or a sentence.
const SENTENCE_OPENING_RE = /(?:^|[.!?…\n\r])[\s"'“‘([]*$/

const contactSourceLabels: Record<ContactSource, string> = {
  [contactSources.enum.inboundMessage]: "Inbound Message",
  [contactSources.enum.webchat]: "Webchat",
  [contactSources.enum.ads]: "Ads",
  [contactSources.enum.botLink]: "Bot Link",
  [contactSources.enum.chatPlugin]: "Chat Plugin",
  [contactSources.enum.comments]: "Facebook/IG Comment",
  [contactSources.enum.imported]: "Imported",
  [contactSources.enum.api]: "API",
  [contactSources.enum.direct]: "Direct",
}

const formatContactSource = (source: string | null | undefined): string => {
  if (!source) {
    return "Unknown"
  }
  const parsedSource = contactSources.safeParse(source)
  if (!parsedSource.success) {
    return source
  }
  return contactSourceLabels[parsedSource.data]
}

const capitalizeFirstLetter = (value: string | null): string | null => {
  if (!value) {
    return value
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export type InterpolateOptions = {
  /** Case `{{gender}}` by position. Prose wants it; URLs and JSON must not. */
  sentenceCase?: boolean
}

export const extractVariables = (text: string): string[] => [
  ...new Set(
    Array.from(text.matchAll(VARIABLE_PLACEHOLDER_REGEX), (match) =>
      match[1].trim(),
    ),
  ),
]

export const interpolate = (
  text: string,
  mapping: Record<string, string>,
  options: InterpolateOptions = {},
): string =>
  text.replace(
    VARIABLE_PLACEHOLDER_REGEX,
    (match, variable: string, offset: number) => {
      const key = variable.trim()
      const value = mapping[key]
      if (value === undefined) {
        return match
      }
      if (!(options.sentenceCase && SENTENCE_CASED_VARIABLES.has(key))) {
        return value
      }
      return SENTENCE_OPENING_RE.test(text.slice(0, offset))
        ? value
        : value.toLowerCase()
    },
  )

// Canonical definition — contact-variable.ts imports this instead of
// redefining it, so the `raw:` prefix can't drift between the message-text
// resolver and the JS-code resolver in this file.
export const RAW_CUSTOM_FIELD_VARIABLE_PREFIX = "raw:"

type QuoteChar = '"' | "'" | "`"

const CONTROL_CHAR_ESCAPES: Record<string, string> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
}

// Escapes a resolved value for splicing into JS source *without* adding
// quotes of its own. Escapes ALL THREE quote characters (`"`, `'`, `` ` ``)
// unconditionally, plus `${` and control chars — not just the one quote
// character classifyPlaceholderContext guesses is "active" at the splice
// point. That guess comes from a heuristic character scan (see
// findEnclosingQuote), not a real parse, and can be wrong — e.g. a `'`
// inside a `/* comment */` earlier on the same line throws off the scan. If
// escaping only trusted the guessed quote, a wrong guess would leave the
// *real* enclosing quote unescaped in the substituted text, letting a
// contact-controlled value break out of its literal and inject additional
// statements. Escaping defensively against all three means a wrong guess
// degrades to harmless over-escaping (e.g. an unnecessary `\'` inside a
// `"`-delimited string, which is valid JS and round-trips to the same
// character) instead of an exploitable gap.
const escapeForQuote = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/[\n\r\t]/g, (char) => CONTROL_CHAR_ESCAPES[char] ?? char)

const NUMERIC_LITERAL_RE = /^-?\d+(\.\d+)?$/

// Numeric/boolean custom fields are stored as plain strings, so the raw text
// must be parsed and re-serialized rather than passed through — that
// round-trip is the injection guard for this branch: NUMERIC_LITERAL_RE
// rejects anything that isn't a plain (optionally signed, optionally
// decimal) digit run — including "25; drop()", "1e999", and "NaN" — before
// Number() ever sees it. The Number.isFinite check after that catches the
// remaining case the regex admits but IEEE 754 can't represent exactly: a
// digit run long enough to overflow to Infinity (e.g. 400 nines).
const numberLiteral = (value: string): string => {
  if (!NUMERIC_LITERAL_RE.test(value.trim())) {
    return "null"
  }
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? String(parsed) : "null"
}

// Mirrors numberLiteral: only the two exact boolean spellings succeed, and
// anything else (empty, corrupted, "yes", "1", ...) emits `null` rather than
// silently defaulting to `false` — a corrupt/unmigrated boolean should be
// detectably absent, not indistinguishable from a real negative answer.
const booleanLiteral = (value: string): string => {
  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "false") {
    return normalized
  }
  return "null"
}

// Emits a JS literal (or bare escaped text) for a resolved variable value,
// appropriate to its custom-field type, so `{{age}} + 1` becomes `25 + 1`
// (not `"25" + 1"`). `wrapQuote` is set when the placeholder must supply its
// own quotes (a "whole-literal" or "bare" placement); it is `null` when the
// text is dropped inside an author-written literal that already has its own
// delimiters ("inside-literal" — see classifyPlaceholderContext).
const literalForField = (
  field: ContactCustomFieldValue | null,
  wrapQuote: QuoteChar | null,
): string => {
  if (!field || field.value === null || field.value === undefined) {
    return "null"
  }
  switch (field.type) {
    case "number":
      return numberLiteral(field.value)
    case "boolean":
      return booleanLiteral(field.value)
    default: {
      const escaped = escapeForQuote(field.value)
      return wrapQuote ? `${wrapQuote}${escaped}${wrapQuote}` : escaped
    }
  }
}

// A discriminated union, not a product type: "bare" never carries a quote
// (there's no enclosing literal to reuse), while "whole-literal" and
// "inside-literal" always do — encoding that as a shared nullable `quote`
// field would let combinations like { context: "bare", quote: '"' } (or the
// reverse) typecheck even though they can't occur. "ambiguous" carries
// neither, since it's a refusal to classify at all (see
// classifyPlaceholderContext's regex-literal note).
type PlaceholderClassification =
  | { context: "bare"; consumeStart: number; consumeEnd: number }
  | {
      context: "whole-literal"
      consumeStart: number
      consumeEnd: number
      quote: QuoteChar
    }
  | {
      context: "inside-literal"
      consumeStart: number
      consumeEnd: number
      quote: QuoteChar
    }
  | { context: "ambiguous" }

// The quote character literalForField should wrap a substitution in, given
// how it's placed: "inside-literal" splices bare escaped text into an
// existing literal (no quotes of its own — null); "whole-literal" re-wraps
// in the quote it consumed; "bare" has no enclosing literal to reuse, so it
// needs its own quotes — default `"`. Never called for "ambiguous" (the
// main loop skips substitution for that variant entirely, the same as
// "unknown" — see classifyPlaceholderContext).
const wrapQuoteFor = (
  classification: PlaceholderClassification,
): QuoteChar | null => {
  if (classification.context === "inside-literal") {
    return null
  }
  if (classification.context === "whole-literal") {
    return classification.quote
  }
  if (classification.context === "bare") {
    return '"'
  }
  throw new Error("wrapQuoteFor called for an ambiguous classification")
}

const isQuoteChar = (char: string | undefined): char is QuoteChar =>
  char === '"' || char === "'" || char === "`"

// Scans backward from `index` for the nearest unescaped quote character that
// isn't itself closed before `index` — i.e. the opening delimiter of a
// string literal that `index` sits inside, or undefined if none is open.
// Backtracking stops at a newline for `"`/`'` (they can't span lines in
// valid JS) but not for `` ` ``, since template literals can. This is a
// heuristic, not a tokenizer: a quote inside a comment, or one belonging to
// a different (already-closed) literal on the same line, can confuse it —
// documented limit, not a full JS parse.
const findEnclosingQuote = (
  code: string,
  index: number,
): { quote: QuoteChar; openIndex: number } | null => {
  let open: { quote: QuoteChar; openIndex: number } | null = null
  for (let i = 0; i < index; i++) {
    const char = code[i]
    if (char === "\\") {
      i++
      continue
    }
    if (open) {
      if (char === open.quote) {
        open = null
      } else if (char === "\n" && open.quote !== "`") {
        // An unterminated "/'/ literal can't survive a newline in valid JS;
        // treat it as closed so a later real quote isn't misread as nested.
        open = null
      }
      continue
    }
    if (isQuoteChar(char)) {
      open = { quote: char, openIndex: i }
    }
  }
  return open
}

// Finds the index *of* the closing quote character matching `quote`,
// searching forward from `from` (the caller adds its own `+ 1` where it
// needs the position just past it). Returns -1 if unterminated before the
// code ends (or, for `"`/`'`, before a newline).
const findClosingQuote = (
  code: string,
  from: number,
  quote: QuoteChar,
): number => {
  for (let i = from; i < code.length; i++) {
    const char = code[i]
    if (char === "\\") {
      i++
      continue
    }
    if (char === quote) {
      return i
    }
    if (char === "\n" && quote !== "`") {
      return -1
    }
  }
  return -1
}

// A `/`-delimited regex literal is a fourth kind of enclosing "quote" that
// findEnclosingQuote doesn't recognize at all — so a placeholder inside one
// (`const re = /{{name}}/;`) is misclassified as "bare", and the fresh `"`
// wrap that implies does not close the still-open regex literal, letting a
// value containing `"` break out and inject statements (confirmed
// exploitable: verified end to end with a real side effect firing).
// Properly tokenizing regex-vs-division is the classic JS lexer ambiguity
// (context-dependent on the preceding token) and out of scope for a
// heuristic scanner. Instead: detect *ambiguity* — an odd count of
// unescaped, non-comment `/` characters on the current line before `start`
// — and refuse to classify rather than guess. This also flags plain
// division (`a / {{b}}`) as ambiguous, which is a safe false positive: it
// forces a loud JS syntax error (the same "unknown name" failure mode),
// never a silent injection.
const hasUnclosedSlashOnLine = (code: string, index: number): boolean => {
  const lineStart = code.lastIndexOf("\n", index - 1) + 1
  let openSlash = false
  for (let i = lineStart; i < index; i++) {
    const char = code[i]
    if (char === "\\") {
      i++
      continue
    }
    if (char === "/") {
      if (code[i + 1] === "/" && !openSlash) {
        // A `//` line comment starts here and runs to the newline, so
        // nothing after it on this line is real code to scan.
        return openSlash
      }
      openSlash = !openSlash
    }
  }
  return openSlash
}

// Classifies how a `{{...}}` match sits relative to its surrounding quotes,
// without a full JS parse (see findEnclosingQuote for the heuristic's
// documented limits):
//   - "whole-literal": the match, including one quote on each side, is the
//     entire string literal (`"{{x}}"`) — the surrounding quotes are
//     consumed and a fresh pair of the same quote character is re-added.
//   - "inside-literal": the match sits inside a larger string literal
//     (`"a {{x}} b"` or a template literal) — only the escaped inner text is
//     substituted, the surrounding quotes stay put.
//   - "bare": the match is not inside any string literal (`{{age}} + 1`) —
//     used for numeric/boolean bare substitution, or a fresh double-quoted
//     string literal when a string-type field ends up bare.
//   - "ambiguous": would-be "bare", but an odd count of unescaped `/` on the
//     same line means it might actually be inside a regex literal — refused
//     rather than guessed (see hasUnclosedSlashOnLine).
const classifyPlaceholderContext = (
  code: string,
  start: number,
  end: number,
): PlaceholderClassification => {
  const enclosing = findEnclosingQuote(code, start)
  if (!enclosing) {
    if (hasUnclosedSlashOnLine(code, start)) {
      return { context: "ambiguous" }
    }
    return { context: "bare", consumeStart: start, consumeEnd: end }
  }

  const { quote, openIndex } = enclosing
  const closeIndex = findClosingQuote(code, end, quote)
  // closeIndex === end already means code[end] === quote (that's the only
  // way findClosingQuote returns a non-(-1) index), so checking both would
  // be a redundant, always-true conjunct.
  const isWholeLiteral = closeIndex === end && openIndex === start - 1

  if (isWholeLiteral) {
    return {
      context: "whole-literal",
      consumeStart: openIndex,
      consumeEnd: end + 1,
      quote,
    }
  }

  return {
    context: "inside-literal",
    consumeStart: start,
    consumeEnd: end,
    quote,
  }
}

// Canonical definition — contact-variable.ts imports this instead of
// redefining it, so the `raw:` prefix and name-stripping logic can't drift
// between the message-text resolver and this JS-code resolver. Matches
// custom-field names exactly (no trimming): the map is keyed by the raw
// `customField.name`, and the token is built from that same name, so any
// normalisation here would break names with meaningful surrounding
// whitespace.
export const toRawCustomFieldName = (variable: string): string =>
  variable.slice(RAW_CUSTOM_FIELD_VARIABLE_PREFIX.length)

// System-field and coupon values are always plain strings (no custom-field
// `type`), so they're treated as shortText for literal emission — quoted
// unless the placeholder sits bare in code. Also used for `raw:` fields
// (see resolveJavascriptVariable), whose contract is "unformatted string",
// regardless of the field's own declared type.
const stringFieldValue = (
  value: string | null,
): ContactCustomFieldValue | null =>
  value === null ? null : { key: "", type: "shortText", value, description: "" }

// "Unknown name": leave the literal `{{...}}` in place (a bare placement
// then surfaces as a JS syntax error — a loud failure; a quoted placement
// ships the literal text silently, see interpolateIntoJavascript's doc
// comment). "Resolved": substitute `field` (`null` becomes the `null`
// literal). A plain `ContactCustomFieldValue | null | undefined` return
// would let the two meanings collapse into an ambiguous `Map.get` read at
// the call site; this keeps them distinct through resolution.
type ResolvedVariable =
  | { kind: "unknown" }
  | { kind: "resolved"; field: ContactCustomFieldValue | null }

// Resolution order mirrors contact-variable.ts's variableResolvers so
// `{{first_name}}` behaves the same in JS-step code as in message text:
// system fields, then `raw:`, then custom fields, then coupons. `raw:`
// falls through to the later checks when its stripped name doesn't match a
// custom field, exactly like rawCustomFieldResolver.matches does — so a
// custom field literally named e.g. "raw:foo" (not itself found under
// "foo") is still reachable by its own literal name.
const resolveJavascriptVariable = async (
  name: string,
  context: ReplaceVariableProps,
): Promise<ResolvedVariable> => {
  if (Object.values(systemFieldTypes.enum).includes(name as SystemFieldType)) {
    return {
      kind: "resolved",
      field: stringFieldValue(
        await getSystemFieldValue(context, name as SystemFieldType),
      ),
    }
  }
  if (name.startsWith(RAW_CUSTOM_FIELD_VARIABLE_PREFIX)) {
    const rawField = context.customFieldsMap.get(toRawCustomFieldName(name))
    if (rawField) {
      // raw: is "unformatted value", always a plain string — never the
      // field's own type-aware literal (e.g. a number field's bare digits).
      return { kind: "resolved", field: stringFieldValue(rawField.value) }
    }
  }
  if (context.customFieldsMap.has(name)) {
    return {
      kind: "resolved",
      field: context.customFieldsMap.get(name) ?? null,
    }
  }
  if (isCouponVariable(name)) {
    return {
      kind: "resolved",
      field: stringFieldValue(await resolveCouponVariable(context, name)),
    }
  }
  return { kind: "unknown" }
}

/**
 * Substitutes `{{...}}` placeholders inside JavaScript source (an Execute
 * JavaScript flow step's code) with type-aware, escaped JS literals, so
 * authors can reference contact/system/custom fields directly in code the
 * same way they do in message text.
 *
 * Deliberately not a full JS parse — see classifyPlaceholderContext for the
 * documented limits of the quote-context heuristic; escapeForQuote's
 * unconditional escaping of all three quote characters is what keeps a
 * misclassification safe (over-escaping) rather than exploitable. Unknown
 * names are left as the literal `{{...}}` (matching interpolate's existing
 * behavior): in a "bare" position that then surfaces as a JS syntax error —
 * a loud failure — but inside a quoted literal it ships silently as inert
 * string data, since the surrounding literal parses fine either way.
 */
export const interpolateIntoJavascript = async (
  code: string,
  context: ReplaceVariableProps,
): Promise<string> => {
  const names = extractVariables(code)
  const resolved = new Map<string, ResolvedVariable>()

  for (const name of names) {
    resolved.set(name, await resolveJavascriptVariable(name, context))
  }

  let result = ""
  let cursor = 0
  // Tracks the end of the previous substitution *only* when it emitted a
  // standalone, self-quoting literal token ("bare" or "whole-literal") —
  // "inside-literal" splices into text that's already part of a larger,
  // still-open literal, so it can't create a new token boundary against
  // whatever follows.
  let previousSelfQuotingEnd: number | null = null
  for (const match of code.matchAll(VARIABLE_PLACEHOLDER_REGEX)) {
    const name = match[1].trim()
    const resolution = resolved.get(name)
    if (
      !resolution ||
      resolution.kind === "unknown" ||
      match.index === undefined
    ) {
      continue
    }
    const start = match.index
    const end = start + match[0].length
    const classification = classifyPlaceholderContext(code, start, end)
    if (classification.context === "ambiguous") {
      // Refuse rather than guess (see classifyPlaceholderContext) — leave
      // the literal `{{...}}` in place, same as an unknown name.
      previousSelfQuotingEnd = null
      continue
    }
    const { consumeStart, consumeEnd } = classification
    const isSelfQuoting = classification.context !== "inside-literal"

    result += code.slice(cursor, consumeStart)
    // Two adjacent self-quoting substitutions — "bare" (`{{a}}{{b}}`) or
    // "whole-literal" (`"{{a}}""{{b}}"`) in any combination — would
    // otherwise each emit their own literal with nothing between them,
    // producing invalid JS (`"A""B"`); joining them with `+` keeps the
    // result valid.
    if (isSelfQuoting && previousSelfQuotingEnd === consumeStart) {
      result += "+"
    }
    result += literalForField(resolution.field, wrapQuoteFor(classification))
    cursor = consumeEnd
    previousSelfQuotingEnd = isSelfQuoting ? consumeEnd : null
  }
  result += code.slice(cursor)

  return result
}

const getTimezone = ({
  contact,
  workspace,
}: ContactVariableContext): string | null =>
  workspace?.timezone ?? normalizeStoredTimezone(contact.timezone)

export const getContactTimezone = ({
  contact,
  workspace,
}: ContactVariableContext): string | null =>
  normalizeStoredTimezone(contact.timezone) ??
  workspace?.timezone ??
  DEFAULT_FILTER_TIMEZONE

const formatDate = (
  date: Date | string | null | undefined,
  timezone: string | null,
): string | null => {
  if (!date) {
    return null
  }

  return formatWithFallback(date, timezone, DATE_FORMAT)
}

const formatDateTime = (
  date: Date | string | null | undefined,
  timezone: string | null,
): string | null => {
  if (!date) {
    return null
  }

  return formatWithFallback(date, timezone, DATE_TIME_FORMAT)
}

export const renderCustomFieldValue = (
  type: string,
  value: string | null | undefined,
  timezone: string | null | undefined,
): string =>
  formatCustomFieldValueInTimeZone(
    type,
    value,
    timezone ?? DEFAULT_FILTER_TIMEZONE,
  )

const getWorkspaceLogo = ({
  workspace,
}: ContactVariableContext): string | null => {
  if (!workspace?.logo) {
    return null
  }

  return workspace.logo
}

const getContactLocationValue = (
  contact: ContactVariableContext["contact"],
  key: "latitude" | "longitude",
): string | null => {
  const value = contact.location?.[key]
  return typeof value === "number" ? String(value) : null
}

const getReferralValue = (
  contactInbox: ContactVariableContext["contactInbox"],
  key: "adId" | "adTitle" | "ctwaClid" | "sourceUrl" | "sourcePlatform",
): string | null => {
  const value = contactInbox?.referral?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

const getFlowStepValue = async (
  context: ContactVariableContext,
  key: "lastStep" | "currentStep",
): Promise<string | null> => {
  const conversation = await conversationService.findDMByContact({
    workspaceId: context.contact.workspaceId,
    contactId: context.contact.id,
  })
  return conversation?.[key] ?? null
}

// The user's own last comment is stored as a pointer to the exact Message row.
// `createdAt` is part of the lookup because Message is time-partitioned.
const getLastUserComment = async (
  context: ContactVariableContext,
): Promise<MessageModel | null> => {
  const { contact, contactInbox } = context
  if (
    !(contactInbox?.lastCommentMessageId && contactInbox.lastCommentMessageAt)
  ) {
    return null
  }

  const message = await messageService.findById({
    id: contactInbox.lastCommentMessageId,
    createdAt: contactInbox.lastCommentMessageAt,
    workspaceId: contact.workspaceId,
  })
  if (!message || message.deletedAt) {
    return null
  }

  return message
}

const getCommentMessagePostId = (
  message: MessageModel | null,
): string | null => {
  const postId = message?.contentAttributes?.postId
  return typeof postId === "string" ? postId : null
}

// The contact's own language, in the order the platform learns it: the channel
// language we recorded, then the locale their profile reports. Undefined when
// the contact never told us, so the caller picks the fallback. Blank values
// normalise away here rather than shadowing that fallback.
const getContactLanguage = (
  context: ContactVariableContext,
): string | undefined =>
  languageFromLocale(context.contactInbox?.language) ??
  languageFromLocale(context.contact.locale)

const getAppointment = async (
  context: ContactVariableContext,
): Promise<Awaited<ReturnType<typeof appointmentService.findBy>> | null> => {
  if (context.appointmentId) {
    const appointment = await appointmentService.findBy({
      workspaceId: context.contact.workspaceId,
      id: context.appointmentId,
    })

    return appointment && appointment.contactId === context.contact.id
      ? appointment
      : null
  }

  const latest = await appointmentService.findLatestForContact({
    workspaceId: context.contact.workspaceId,
    contactId: context.contact.id,
  })

  return latest ?? null
}

export const getSystemFieldValue = async (
  context: ContactVariableContext,
  key: SystemFieldType,
): Promise<string | null> => {
  const { contact, contactInbox, workspace } = context
  const timezone = getTimezone(context)
  // Timestamps tied to a specific contact (when they subscribed, were last seen)
  // read in the contact's own timezone, falling back to the workspace timezone
  // (then UTC). `timezone` above stays workspace-first for workspace-scoped
  // values like current_time. See getContactTimezone.
  const contactTimezone = getContactTimezone(context)

  switch (key) {
    case systemFieldTypes.enum.email:
      return contact.email
    case systemFieldTypes.enum.phone:
      return contact.phoneNumber
    case systemFieldTypes.enum.first_name:
      return contact.firstName
    case systemFieldTypes.enum.last_name:
      return contact.lastName
    case systemFieldTypes.enum.full_name:
      return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    case systemFieldTypes.enum.profile_pic:
      return await toPublicStorageUrl(contact.avatar, contact.workspaceId)
    case systemFieldTypes.enum.gender:
      return resolveGenderLabel(
        getContactLanguage(context) ?? workspace?.language,
        contact.gender,
      )
    case systemFieldTypes.enum.user_country:
      return contact.country
    case systemFieldTypes.enum.user_state:
      return contact.state
    case systemFieldTypes.enum.user_city:
      return contact.city
    case systemFieldTypes.enum.locale:
      return contact.locale
    case systemFieldTypes.enum.locale2:
      return contact.locale?.split(LOCALE_SEPARATOR_RE)[0] ?? null
    case systemFieldTypes.enum.timezone:
      return offsetFromStoredTimezone(contact.timezone)
    case systemFieldTypes.enum.language:
      return (
        contactInbox?.language ?? languageFromLocale(contact.locale) ?? null
      )
    case systemFieldTypes.enum.user_id:
      return contactInbox?.sourceId ?? null
    case systemFieldTypes.enum.subscribed_date:
      return formatDate(contactInbox?.createdAt, contactTimezone)
    case systemFieldTypes.enum.last_seen:
      return formatDateTime(contactInbox?.contactLastReadAt, contactTimezone)
    case systemFieldTypes.enum.last_input:
      return await getContactLastInput(contact.id)
    case systemFieldTypes.enum.last_input_type:
      return await getContactLastInputType(contact.id)
    case systemFieldTypes.enum.user_channel:
      return capitalizeFirstLetter(
        contactInbox?.channel ?? (await findPrimaryContactChannel(contact.id)),
      )
    case systemFieldTypes.enum.user_tags:
      return await listContactTagsString(contact.id)
    case systemFieldTypes.enum.user_hash: {
      if (!contactInbox) {
        return null
      }
      return await signUserHash({
        sourceId: contactInbox.sourceId,
        contactInboxId: contactInbox.id,
      })
    }
    case systemFieldTypes.enum.workspace_id:
      return contact.workspaceId
    case systemFieldTypes.enum.user_source:
      return formatContactSource(contactInbox?.source)
    case systemFieldTypes.enum.assigned_admin_name:
      return await resolveAssigneeName(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.assigned_admin_email:
      return await resolveAssigneeEmail(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.assigned_admin_id:
      return await resolveAssigneeId(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.current_user_time:
      return formatWithFallback(
        new Date(),
        getContactTimezone(context),
        DATE_TIME_FORMAT,
      )
    case systemFieldTypes.enum.chat_history:
      return await getChatHistory(contact.id, 50)
    case systemFieldTypes.enum.chat_history_large:
      return await getChatHistory(contact.id, 200)
    case systemFieldTypes.enum.chat_history_details:
      return await getChatHistory(contact.id, 50, true)
    case systemFieldTypes.enum.chat_history_details_large:
      return await getChatHistory(contact.id, 200, true)
    case systemFieldTypes.enum["ai.queued.messages"]:
      return await getQueuedMessages(context)
    case systemFieldTypes.enum.user_notes:
      return await listContactNotesString(contact.id)
    case systemFieldTypes.enum.avatar:
      return await toPublicStorageUrl(contact.avatar, contact.workspaceId)
    case systemFieldTypes.enum.current_time:
      return formatWithFallback(new Date(), timezone, DATE_TIME_FORMAT)
    case systemFieldTypes.enum.workspace_name:
    case systemFieldTypes.enum.account_name:
      return workspace?.name ?? null
    case systemFieldTypes.enum.account_id:
      return contact.workspaceId
    case systemFieldTypes.enum.account_image:
      return await toPublicStorageUrl(
        getWorkspaceLogo(context),
        contact.workspaceId,
      )
    case systemFieldTypes.enum.page_user_name:
    case systemFieldTypes.enum.inbox_link:
    case systemFieldTypes.enum.ig_user_name:
    case systemFieldTypes.enum.ig_followers:
    case systemFieldTypes.enum.ig_verified:
    case systemFieldTypes.enum.ig_follow_business:
    case systemFieldTypes.enum.ig_business_follow_user:
    case systemFieldTypes.enum.timezone_name:
    case systemFieldTypes.enum.fb_chat_link:
    case systemFieldTypes.enum.user_code:
    case systemFieldTypes.enum.webchat:
    case systemFieldTypes.enum.wa_user_id:
    case systemFieldTypes.enum.wa_user_name:
      return await getIntegrationField(
        contact,
        key,
        contactInbox,
        context.conversation?.id,
      )
    case systemFieldTypes.enum.me:
      if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
        return null
      }
      return await getIntegrationField(
        contact,
        key,
        contactInbox,
        context.conversation?.id,
      )
    case systemFieldTypes.enum.last_ref:
      return contact.ref ?? contactInbox?.referral?.ref ?? null
    case systemFieldTypes.enum.last_interaction:
      return formatDateTime(contactInbox?.lastIncomingMessageAt, timezone)
    case systemFieldTypes.enum.last_user_note:
      return await getLatestContactNoteString(contact.id)
    case systemFieldTypes.enum.member_name:
      return await resolveAssigneeName(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.team_name:
      return await getAssignedTeamName(contact.id)
    // No upstream tracking yet — intentionally null
    case systemFieldTypes.enum.last_order:
      return null
    case systemFieldTypes.enum.last_btn_title:
      return contactInbox?.lastBtnTitle ?? null
    case systemFieldTypes.enum.consecutive_failed_reply:
      return contactInbox
        ? String(contactInbox.consecutiveFailedReply ?? 0)
        : null
    case systemFieldTypes.enum.user_external_id:
      return contactInbox?.sourceId ?? null
    case systemFieldTypes.enum.webchat_parent_url:
      return contactInbox?.webchatParentUrl ?? null
    case systemFieldTypes.enum.api_key:
      return workspace?.token ?? null
    case systemFieldTypes.enum.last_ad:
      return getReferralValue(contactInbox, "adId")
    case systemFieldTypes.enum.last_ctwa:
      return getReferralValue(contactInbox, "ctwaClid")
    case systemFieldTypes.enum.last_ad_source_url:
      return getReferralValue(contactInbox, "sourceUrl")
    case systemFieldTypes.enum.last_ad_source_platform:
      return getReferralValue(contactInbox, "sourcePlatform")
    case systemFieldTypes.enum.last_fb_comment:
      return (await getLastUserComment(context))?.text ?? null
    case systemFieldTypes.enum.last_post_id: {
      const message = await getLastUserComment(context)
      return getCommentMessagePostId(message)
    }
    case systemFieldTypes.enum.last_comment_id:
      return (await getLastUserComment(context))?.sourceId ?? null
    case systemFieldTypes.enum.total_new_tagged:
      return null
    case systemFieldTypes.enum.total_tagged:
      return null
    case systemFieldTypes.enum.last_latitude:
      return getContactLocationValue(contact, "latitude")
    case systemFieldTypes.enum.last_longitude:
      return getContactLocationValue(contact, "longitude")
    case systemFieldTypes.enum.last_error_log:
      return contactInbox?.lastErrorLog ?? null
    case systemFieldTypes.enum.last_outbound_message_at:
      return formatDateTime(contactInbox?.lastOutboundMessageAt, timezone)
    case systemFieldTypes.enum.last_commented_post_text: {
      const message = await getLastUserComment(context)
      const postId = getCommentMessagePostId(message)
      return await getLastCommentedPostText(contactInbox, postId)
    }
    case systemFieldTypes.enum.last_step:
      return await getFlowStepValue(context, "lastStep")
    case systemFieldTypes.enum.current_step:
      return await getFlowStepValue(context, "currentStep")
    case systemFieldTypes.enum.booking_calendar:
      return (await getAppointment(context))?.calendar.name ?? null
    case systemFieldTypes.enum.booking_date: {
      const appointment = await getAppointment(context)
      return formatDateTime(
        appointment?.startAt,
        appointment?.inviteeTimezone ?? contactTimezone,
      )
    }
    case systemFieldTypes.enum.last_input_failure:
      return contactInbox?.lastInputFailure ?? null
    case systemFieldTypes.enum.booking_link: {
      const appointment = await getAppointment(context)
      if (!appointment) {
        return null
      }
      const { appUrl } = await resolveTenantSettings({
        workspaceId: contact.workspaceId,
      })
      const token = await signAppointmentScheduleToken({
        appointmentId: appointment.id,
        workspaceId: appointment.workspaceId,
        contactId: appointment.contactId,
        conversationId: appointment.conversationId ?? undefined,
      })
      return buildAppointmentUrl(appUrl, "/booking/schedule", token)
    }
    default: {
      // Adding a systemFieldTypes value without a case above fails to compile
      // here. If one ever reaches runtime it must not take a message down, so
      // it degrades to null (an empty substitution) and reports itself.
      const unhandled: never = key
      logger.error(`Unhandled system field: ${String(unhandled)}`)
      return null
    }
  }
}
