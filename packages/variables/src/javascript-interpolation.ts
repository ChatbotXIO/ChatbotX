import {
  type CustomFieldType,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import { isCouponVariable, resolveCouponVariable } from "./coupon-variable"
import type { ReplaceVariableProps } from "./schema"
import {
  extractVariables,
  getSystemFieldValue,
  RAW_CUSTOM_FIELD_VARIABLE_PREFIX,
  toRawCustomFieldName,
  VARIABLE_PLACEHOLDER_REGEX,
} from "./utils"

// A JS identifier-safe key an author's `{{name}}` placeholder is rewritten
// to: `input["<key>"]`. Only characters that are safe inside a
// double-quoted JS string need escaping — this is a plain property lookup,
// never a spliced value, so there is no quote-context or comment-awareness
// heuristic to get wrong (contrast the source-splicing approach this
// replaced: see git history of this file for the exploits that approach
// could not close — a misclassified regex literal, a `/* … */` comment, and
// two adjacent template-literal substitutions reconstituting `${`).
const toInputPropertyAccess = (key: string): string =>
  `input[${JSON.stringify(key)}]`

type QuoteChar = '"' | "'" | "`"

const isQuoteChar = (char: string | undefined): char is QuoteChar =>
  char === '"' || char === "'" || char === "`"

// Scans backward from `index` for the nearest unescaped quote character that
// isn't itself closed before `index` — i.e. the opening delimiter of a
// string literal that `index` sits inside, or undefined if none is open.
// Backtracking stops at a newline for `"`/`'` (they can't span lines in
// valid JS) but not for `` ` ``, since template literals can. This is a
// heuristic, not a tokenizer: a quote inside a comment, or a `"`/`'` nested
// inside a template literal's `${...}` expression hole, can confuse it —
// documented limit, not a full JS parse. Unlike the source-splicing
// implementation this replaced, a misclassification here only risks a
// syntax error in the *author's own* code (the placeholder's fixed,
// author-controlled name gets spliced into the wrong place) — it can never
// let contact-controlled data become executable, since no value is ever
// written into the code.
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
// searching forward from `from`. Returns -1 if unterminated before the code
// ends (or, for `"`/`'`, before a newline) — an already-invalid-JS input the
// rewrite below deliberately leaves untouched past that point (see its
// `literalEnd === -1` branch).
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
// findEnclosingQuote doesn't recognize — so a placeholder inside one
// (`const re = /{{name}}/;`) would be misclassified as "bare" and spliced as
// a bare `input["name"]` expression, which does not close the still-open
// regex literal and produces a syntax error. Detect *ambiguity* instead — an
// odd count of unescaped, non-comment `/` characters on the current line
// before `start` — and refuse to classify rather than guess, leaving the
// placeholder as literal `{{...}}` text (same as an unknown name). This also
// flags plain division (`a / {{b}}`) as ambiguous, a safe false positive.
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
        return openSlash
      }
      openSlash = !openSlash
    }
  }
  return openSlash
}

// A discriminated union, not a product type: "bare"/"ambiguous" never carry
// a literal span, while "whole-literal" and "inside-literal" always do.
// "inside-literal" additionally carries the enclosing literal's own
// `literalStart`/`literalEnd` (the quote characters themselves), separate
// from `consumeStart`/`consumeEnd` (the placeholder's own span within it) —
// needed to group multiple placeholders that share one enclosing literal
// and rewrite it as a single spliced expression (see interpolateIntoJavascript).
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
      literalStart: number
      literalEnd: number
    }
  | { context: "ambiguous" }

// Classifies how a `{{...}}` match sits relative to its surrounding quotes,
// without a full JS parse (see findEnclosingQuote for the heuristic's
// documented limits):
//   - "whole-literal": the match, including one quote on each side, is the
//     entire string literal (`"{{x}}"`) — the surrounding quotes are dropped
//     entirely, since `input["x"]` is already a valid expression on its own.
//   - "inside-literal": the match sits inside a larger string or template
//     literal (`"a {{x}} b"`) — the literal is split at the placeholder and
//     re-joined with `input["x"]` spliced in (see interpolateIntoJavascript).
//   - "bare": the match is not inside any string literal (`{{age}} + 1`) —
//     `input["age"]` is spliced in directly as a plain expression.
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
  const isWholeLiteral = closeIndex === end && openIndex === start - 1

  if (isWholeLiteral) {
    return {
      context: "whole-literal",
      consumeStart: openIndex,
      consumeEnd: end + 1,
      quote,
    }
  }

  // The literal's own close may sit past `end` (more text or placeholders
  // follow within it), so it's re-derived from `start`, not `end`. A quote
  // character appearing unescaped before the true close would only occur if
  // the literal had already ended — findClosingQuote's backslash-skip
  // already accounts for the only other way one could appear.
  const literalEnd = findClosingQuote(code, start, quote)

  return {
    context: "inside-literal",
    consumeStart: start,
    consumeEnd: end,
    quote,
    literalStart: openIndex,
    literalEnd,
  }
}

type PlaceholderMatch = {
  name: string
  start: number
  end: number
  classification: PlaceholderClassification
}

// A narrowed match whose classification is known not to be "ambiguous" — the
// only case interpolateIntoJavascript's main loop needs to distinguish is
// spliceable (bare/whole-literal/inside-literal) vs. refused, so this alias
// exists purely to let the `.filter()` below narrow the union via an
// explicit type predicate (plain boolean-returning filters don't narrow).
type SpliceableMatch = PlaceholderMatch & {
  classification: Exclude<PlaceholderClassification, { context: "ambiguous" }>
}

const isSpliceable = (match: PlaceholderMatch): match is SpliceableMatch =>
  match.classification.context !== "ambiguous"

// Splices `input["name"]` for every placeholder in `group` into the text of
// the one string/template literal they all share (from `literalStart` to
// `literalEnd`, both quote characters inclusive). Template literals splice
// each as a `${...}` hole in place — the idiomatic form, since template
// holes already interpolate expressions. `"`/`'` literals instead split the
// literal into quoted text segments joined by `+` with the property access
// in between, then wrap the whole thing in parens — necessary because a
// trailing postfix like `.toLowerCase()` on the original literal must keep
// binding to the *entire* resulting string, not just the last segment
// (`+` binds looser than `.`, so an unparenthesized
// `"" + input["x"] + " ".toLowerCase()` would call `.toLowerCase()` on only
// `" "`).
const spliceLiteralGroup = (
  code: string,
  group: readonly PlaceholderMatch[],
  literalStart: number,
  literalEnd: number,
  quote: QuoteChar,
): string => {
  const segments: string[] = []
  let cursor = literalStart + 1
  for (const match of group) {
    segments.push(code.slice(cursor, match.start))
    cursor = match.end
  }
  segments.push(code.slice(cursor, literalEnd))

  if (quote === "`") {
    const holes = group.map(
      (match) => `\${${toInputPropertyAccess(match.name)}}`,
    )
    return (
      "`" +
      segments
        .map((segment, index) => segment + (holes[index] ?? ""))
        .join("") +
      "`"
    )
  }

  const accesses = group.map((match) => toInputPropertyAccess(match.name))
  const parts: string[] = []
  segments.forEach((segment, index) => {
    parts.push(`${quote}${segment}${quote}`)
    if (index < accesses.length) {
      parts.push(accesses[index] as string)
    }
  })
  return `(${parts.join(" + ")})`
}

/**
 * Rewrites `{{...}}` placeholders inside JavaScript source (an Execute
 * JavaScript flow step's code) into `input["name"]` property-access
 * expressions, so authors can reference contact/system/custom/coupon fields
 * directly in code the same way the Tiptap editor's variable picker inserts
 * them elsewhere.
 *
 * This never splices a resolved *value* into source text — only the fixed,
 * JSON-stringified *name* of an `input` key, which `resolveJavascriptInput`
 * has already populated with the real value as data (via isolated-vm's
 * `ExternalCopy`, not as code). A contact-controlled value can therefore
 * never be interpreted as JavaScript, regardless of what characters it
 * contains — there is no escaping step to get wrong. Unknown names, and
 * "ambiguous" placements (see classifyPlaceholderContext), are left as the
 * literal `{{...}}` text (matching `interpolate`'s existing behavior), which
 * surfaces as a JS syntax error if referenced bare — a loud failure, never a
 * silent one.
 *
 * Deliberately not a full JS parse — see classifyPlaceholderContext for the
 * heuristic's documented limits (e.g. a `"`/`'` literal nested inside a
 * template literal's `${...}` hole can confuse it). Because the only thing
 * ever spliced is a fixed, author-controlled placeholder name, the worst
 * case of a misclassification is a syntax error in the author's own code —
 * never contact-controlled data becoming executable.
 */
export const interpolateIntoJavascript = (
  code: string,
  knownNames: ReadonlySet<string>,
): string => {
  const matches: SpliceableMatch[] = Array.from(
    code.matchAll(VARIABLE_PLACEHOLDER_REGEX),
    (match) => ({
      name: (match[1] as string).trim(),
      start: match.index,
      end: match.index + match[0].length,
    }),
  )
    .filter((match) => knownNames.has(match.name))
    .map((match) => ({
      ...match,
      classification: classifyPlaceholderContext(code, match.start, match.end),
    }))
    .filter(isSpliceable)

  let result = ""
  let cursor = 0
  let index = 0
  while (index < matches.length) {
    const match = matches[index]
    const classification = match?.classification
    if (!(match && classification)) {
      break
    }

    if (classification.context !== "inside-literal") {
      result += code.slice(cursor, classification.consumeStart)
      result += toInputPropertyAccess(match.name)
      cursor = classification.consumeEnd
      index++
      continue
    }

    const { literalStart, literalEnd, quote } = classification
    if (literalEnd === -1) {
      // The author's own code already has an unterminated literal here —
      // already invalid JS before any rewrite. Stop rewriting from the
      // literal's opening quote onward so the author sees their own
      // original syntax error, not one this rewrite introduced.
      result += code.slice(cursor, code.length)
      cursor = code.length
      break
    }

    // Group every subsequent match that shares this exact literal span, so
    // "hi {{a}} and {{b}}!" rewrites as one spliced expression rather than
    // two independently-parenthesized ones.
    const group: PlaceholderMatch[] = [match]
    let lookahead = index + 1
    for (; lookahead < matches.length; lookahead++) {
      const candidate = matches[lookahead]
      const candidateClassification = candidate?.classification
      if (
        !candidate ||
        candidateClassification?.context !== "inside-literal" ||
        candidateClassification.literalStart !== literalStart ||
        candidateClassification.literalEnd !== literalEnd
      ) {
        break
      }
      group.push(candidate)
    }

    result += code.slice(cursor, literalStart)
    result += spliceLiteralGroup(code, group, literalStart, literalEnd, quote)
    cursor = literalEnd + 1
    index = lookahead
  }
  result += code.slice(cursor)

  return result
}

/**
 * Coerces a custom field's raw stored string into the JS value its declared
 * `type` implies, so `{{age}}` for a `number`-typed field behaves like a
 * number in an Execute JavaScript step (`{{age}} + 5` adds numerically)
 * instead of always behaving like a string (`"30" + 5` === `"305"`).
 *
 * `date`/`datetime` are deliberately left as their raw ISO string rather
 * than coerced to a JS `Date` — a `Date` changes semantics more than a
 * number/boolean coercion does (equality, serialization, `+` behavior all
 * shift), and isolated-vm's `ExternalCopy` cannot carry a `Date` instance
 * faithfully across the sandbox boundary. Authors who need date math can
 * still do `new Date({{signedUpAt}})` themselves.
 */
export const coerceCustomFieldValueForJavascript = (
  value: string,
  type: CustomFieldType,
): string | number | boolean | null => {
  if (type === "number") {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }
  if (type === "boolean") {
    return value === "true"
  }
  return value
}

// Resolution order mirrors contact-variable.ts's variableResolvers so
// `{{first_name}}` resolves the same way in JS-step code as in message
// text: system fields, then `raw:`, then custom fields, then coupons. `raw:`
// falls through to the later checks when its stripped name doesn't match a
// custom field, exactly like rawCustomFieldResolver.matches does — so a
// custom field literally named e.g. "raw:foo" (not itself found under
// "foo") is still reachable by its own literal name. Returns `undefined`
// (distinct from a resolved `null`) when the name doesn't match anything —
// resolveJavascriptInput uses that to omit it from the result entirely.
const resolveJavascriptInputValue = async (
  name: string,
  context: ReplaceVariableProps,
): Promise<string | number | boolean | null | undefined> => {
  if (Object.values(systemFieldTypes.enum).includes(name as SystemFieldType)) {
    return await getSystemFieldValue(context, name as SystemFieldType)
  }
  if (name.startsWith(RAW_CUSTOM_FIELD_VARIABLE_PREFIX)) {
    const rawField = context.customFieldsMap.get(toRawCustomFieldName(name))
    if (rawField) {
      return coerceCustomFieldValueForJavascript(rawField.value, rawField.type)
    }
  }
  if (context.customFieldsMap.has(name)) {
    const field = context.customFieldsMap.get(name)
    if (!field) {
      return null
    }
    return coerceCustomFieldValueForJavascript(field.value, field.type)
  }
  if (isCouponVariable(name)) {
    return await resolveCouponVariable(context, name)
  }
  return
}

/**
 * Resolves every `{{...}}` name referenced in an Execute JavaScript step's
 * code to a value coerced to match its declared type (see
 * `coerceCustomFieldValueForJavascript`), keyed the same way
 * `input["name"]` will look it up. Returns only the names it could
 * resolve — `interpolateIntoJavascript` leaves any name missing from this
 * map as the literal `{{...}}` text.
 */
export const resolveJavascriptInput = async (
  code: string,
  context: ReplaceVariableProps,
): Promise<Map<string, string | number | boolean | null>> => {
  const names = extractVariables(code)
  const values = await Promise.all(
    names.map((name) => resolveJavascriptInputValue(name, context)),
  )

  const resolved = new Map<string, string | number | boolean | null>()
  names.forEach((name, index) => {
    const value = values[index]
    if (value !== undefined) {
      resolved.set(name, value)
    }
  })

  return resolved
}
