import {
  FILTER_NAMES,
  getFilter,
  MAX_FILTER_STRING_LENGTH,
  MAX_TRUNCATE_LENGTH,
} from "./filters"
import {
  type ComparisonOperator,
  type Condition,
  DEFAULT_TEMPLATE_LIMITS,
  FeedTemplateError,
  type FilterArgument,
  type FilterCall,
  type IfNode,
  type PathSegment,
  type TemplateAst,
  type TemplateErrorCode,
  type TemplateLimits,
  type TemplateNode,
  type TemplateOperand,
} from "./types"

type Token =
  | { index: number; kind: "ident"; text: string }
  | { index: number; kind: "number"; value: number }
  | { index: number; kind: "string"; value: string }
  | { index: number; kind: "punct"; text: string }
  | { index: number; kind: "end" }

const WHITESPACE_CHAR = /\s/
const NUMBER_PART = /[0-9.]/
const IF_BLOCK = /^#if(\s|$)/
const IDENT_START = /[A-Za-z_]/
const IDENT_PART = /[A-Za-z0-9_]/
const DIGIT = /[0-9]/
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
])
const KEYWORDS: ReadonlySet<string> = new Set(["contains", "not"])

class Source {
  readonly text: string

  constructor(text: string) {
    this.text = text
  }

  position(index: number): { column: number; line: number } {
    let line = 1
    let column = 1
    for (let at = 0; at < Math.min(index, this.text.length); at++) {
      if (this.text[at] === "\n") {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
    return { column, line }
  }

  fail(code: TemplateErrorCode, message: string, index: number): never {
    throw new FeedTemplateError(code, message, this.position(index))
  }
}

/** The end of a tag opened at `start`: the index of its `}}`, respecting quoted strings. */
const findTagEnd = (source: Source, start: number): number => {
  const { text } = source
  let quote: string | null = null
  for (let at = start + 2; at < text.length; at++) {
    const char = text[at]
    if (quote) {
      if (char === "\\") {
        at += 1
      } else if (char === quote) {
        quote = null
      }
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === "}" && text[at + 1] === "}") {
      return at
    }
  }
  if (quote) {
    return source.fail(
      "unterminatedString",
      "A quoted text is not closed",
      start,
    )
  }
  return source.fail("unterminatedTag", "A tag is not closed with }}", start)
}

const readString = (
  source: Source,
  text: string,
  start: number,
  offset: number,
): { next: number; value: string } => {
  const quote = text[start]
  let value = ""
  let at = start + 1
  while (at < text.length) {
    const char = text[at]
    if (char === "\\" && at + 1 < text.length) {
      const escaped = text[at + 1]
      value += escaped === "n" ? "\n" : escaped
      at += 2
      continue
    }
    if (char === quote) {
      return { next: at + 1, value }
    }
    value += char
    at += 1
  }
  return source.fail(
    "unterminatedString",
    "A quoted text is not closed",
    offset + start,
  )
}

/** Tokens of one tag's content; `offset` is where the content starts in the source. */
const lex = (source: Source, text: string, offset: number): Token[] => {
  const tokens: Token[] = []
  let at = 0
  while (at < text.length) {
    const char = text[at] as string
    const index = offset + at
    if (WHITESPACE_CHAR.test(char)) {
      at += 1
    } else if (char === '"' || char === "'") {
      const read = readString(source, text, at, offset)
      tokens.push({ index, kind: "string", value: read.value })
      at = read.next
    } else if (IDENT_START.test(char)) {
      let end = at + 1
      while (end < text.length && IDENT_PART.test(text[end] as string)) {
        end += 1
      }
      tokens.push({ index, kind: "ident", text: text.slice(at, end) })
      at = end
    } else if (
      DIGIT.test(char) ||
      (char === "-" && DIGIT.test(text[at + 1] ?? ""))
    ) {
      let end = at + 1
      while (end < text.length && NUMBER_PART.test(text[end] as string)) {
        end += 1
      }
      tokens.push({ index, kind: "number", value: Number(text.slice(at, end)) })
      at = end
    } else if ((char === "=" || char === "!") && text[at + 1] === "=") {
      tokens.push({ index, kind: "punct", text: `${char}=` })
      at += 2
    } else if (".[]|:,".includes(char)) {
      tokens.push({ index, kind: "punct", text: char })
      at += 1
    } else {
      source.fail("unexpectedToken", `Unexpected "${char}"`, index)
    }
  }
  tokens.push({ index: offset + text.length, kind: "end" })
  return tokens
}

class Cursor {
  private at = 0
  private readonly source: Source
  private readonly tokens: Token[]

  constructor(source: Source, tokens: Token[]) {
    this.source = source
    this.tokens = tokens
  }

  peek(): Token {
    return this.tokens[this.at] as Token
  }

  next(): Token {
    const token = this.peek()
    if (token.kind !== "end") {
      this.at += 1
    }
    return token
  }

  isPunct(text: string): boolean {
    const token = this.peek()
    return token.kind === "punct" && token.text === text
  }

  isIdent(text: string): boolean {
    const token = this.peek()
    return token.kind === "ident" && token.text === text
  }

  expectEnd(): void {
    const token = this.peek()
    if (token.kind !== "end") {
      this.fail(token)
    }
  }

  fail(token: Token): never {
    return this.source.fail(
      "unexpectedToken",
      token.kind === "end"
        ? "The tag ends too early"
        : "Unexpected token in the tag",
      token.index,
    )
  }

  failAt(code: TemplateErrorCode, message: string, token: Token): never {
    return this.source.fail(code, message, token.index)
  }
}

const parsePath = (
  cursor: Cursor,
): { segments: PathSegment[]; root: string } => {
  const first = cursor.next()
  if (first.kind !== "ident" || KEYWORDS.has(first.text)) {
    return cursor.fail(first)
  }
  const segments: PathSegment[] = [first.text]
  for (;;) {
    if (cursor.isPunct(".")) {
      cursor.next()
      const part = cursor.next()
      if (part.kind === "ident") {
        segments.push(part.text)
      } else if (part.kind === "number" && Number.isInteger(part.value)) {
        segments.push(part.value)
      } else {
        return cursor.fail(part)
      }
    } else if (cursor.isPunct("[")) {
      cursor.next()
      const part = cursor.next()
      if (part.kind === "string") {
        segments.push(part.value)
      } else if (part.kind === "number" && Number.isInteger(part.value)) {
        segments.push(part.value)
      } else {
        return cursor.fail(part)
      }
      const close = cursor.next()
      if (close.kind !== "punct" || close.text !== "]") {
        return cursor.fail(close)
      }
    } else {
      break
    }
  }
  for (const segment of segments) {
    if (typeof segment === "string" && FORBIDDEN_SEGMENTS.has(segment)) {
      return cursor.failAt("badPath", `"${segment}" cannot be read`, first)
    }
  }
  return { root: first.text, segments }
}

const parseOperand = (cursor: Cursor, roots: Set<string>): TemplateOperand => {
  const token = cursor.peek()
  if (token.kind === "string") {
    cursor.next()
    return { kind: "literal", value: token.value }
  }
  if (token.kind === "number") {
    cursor.next()
    return { kind: "literal", value: token.value }
  }
  const path = parsePath(cursor)
  roots.add(path.root)
  return { kind: "path", segments: path.segments }
}

const parseFilterArgument = (cursor: Cursor): FilterArgument => {
  const token = cursor.next()
  if (token.kind === "string" || token.kind === "number") {
    return token.value
  }
  return cursor.fail(token)
}

const checkFilter = (
  source: Source,
  name: string,
  args: FilterArgument[],
  index: number,
): void => {
  const spec = getFilter(name)
  if (!spec) {
    source.fail(
      "unknownFilter",
      `Unknown filter "${name}". Use one of: ${FILTER_NAMES.join(", ")}`,
      index,
    )
    return
  }
  const required = spec.args.filter((kind) => !kind.endsWith("?")).length
  if (args.length < required || args.length > spec.args.length) {
    source.fail(
      "badFilterArgument",
      `The filter "${name}" takes ${spec.args.length === 0 ? "no argument" : `${required} to ${spec.args.length} argument(s)`}`,
      index,
    )
  }
  for (const [position, value] of args.entries()) {
    const kind = (spec.args[position] ?? "string").replace("?", "")
    if (typeof value !== kind) {
      source.fail(
        "badFilterArgument",
        `Argument ${position + 1} of "${name}" must be a ${kind}`,
        index,
      )
    }
    if (name === "replace" && position === 0 && value === "") {
      source.fail(
        "badFilterArgument",
        'The filter "replace" needs a search text that is not empty',
        index,
      )
    }
    if (typeof value === "string" && value.length > MAX_FILTER_STRING_LENGTH) {
      source.fail("badFilterArgument", "A filter text is too long", index)
    }
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || value > MAX_TRUNCATE_LENGTH)
    ) {
      source.fail("badFilterArgument", "A filter number is out of range", index)
    }
  }
}

const parseFilters = (
  source: Source,
  cursor: Cursor,
  limits: TemplateLimits,
): FilterCall[] => {
  const filters: FilterCall[] = []
  while (cursor.isPunct("|")) {
    cursor.next()
    const name = cursor.next()
    if (name.kind !== "ident") {
      return cursor.fail(name)
    }
    const args: FilterArgument[] = []
    if (cursor.isPunct(":")) {
      cursor.next()
      args.push(parseFilterArgument(cursor))
      while (cursor.isPunct(",")) {
        cursor.next()
        args.push(parseFilterArgument(cursor))
      }
    }
    checkFilter(source, name.text, args, name.index)
    const place = source.position(name.index)
    filters.push({
      args,
      column: place.column,
      line: place.line,
      name: name.text,
    })
    if (filters.length > limits.maxFiltersPerOutput) {
      source.fail("tooComplex", "Too many filters in one tag", name.index)
    }
  }
  return filters
}

const parseCondition = (cursor: Cursor, roots: Set<string>): Condition => {
  let negated = false
  if (cursor.isIdent("not")) {
    cursor.next()
    negated = true
  }
  const operand = parseOperand(cursor, roots)
  const token = cursor.peek()
  let operator: ComparisonOperator | null = null
  if (token.kind === "ident" && token.text === "contains") {
    operator = "contains"
  } else if (
    token.kind === "punct" &&
    (token.text === "==" || token.text === "!=")
  ) {
    operator = token.text
  }
  if (!operator) {
    cursor.expectEnd()
    return { negated, operand }
  }
  cursor.next()
  const right = parseOperand(cursor, roots)
  cursor.expectEnd()
  return { comparison: { operator, right }, negated, operand }
}

type Frame = {
  elseBody: TemplateNode[] | null
  node: IfNode
  opened: number
}

/**
 * Parses a template. Throws {@link FeedTemplateError} with the line and column
 * of the first problem. Only the documented blocks and filters exist; anything
 * else is refused here, never ignored.
 */
export const parseTemplate = (
  sourceText: string,
  limits: TemplateLimits = DEFAULT_TEMPLATE_LIMITS,
): TemplateAst => {
  const source = new Source(sourceText)
  if (sourceText.length > limits.maxSourceLength) {
    source.fail(
      "tooLong",
      `The template is longer than ${limits.maxSourceLength} characters`,
      limits.maxSourceLength,
    )
  }
  const roots = new Set<string>()
  const root: TemplateNode[] = []
  const stack: Frame[] = []
  let nodeCount = 0
  const current = (): TemplateNode[] => {
    const frame = stack.at(-1)
    return frame ? (frame.elseBody ?? frame.node.thenBody) : root
  }
  const add = (node: TemplateNode, index: number): void => {
    nodeCount += 1
    if (nodeCount > limits.maxNodes) {
      source.fail("tooComplex", "The template is too complex", index)
    }
    current().push(node)
  }

  let at = 0
  while (at < sourceText.length) {
    const open = sourceText.indexOf("{{", at)
    if (open === -1) {
      add({ kind: "text", value: sourceText.slice(at) }, at)
      break
    }
    if (open > at) {
      add({ kind: "text", value: sourceText.slice(at, open) }, at)
    }
    const close = findTagEnd(source, open)
    const raw = sourceText.slice(open + 2, close)
    const lead = raw.length - raw.trimStart().length
    const content = raw.trim()
    const offset = open + 2 + lead
    at = close + 2

    if (content === "else") {
      const frame = stack.at(-1)
      if (!frame || frame.elseBody) {
        source.fail("strayEnd", "{{else}} without a matching {{#if}}", open)
      } else {
        frame.elseBody = frame.node.elseBody
      }
    } else if (content === "/if") {
      const frame = stack.pop()
      if (!frame) {
        source.fail("strayEnd", "{{/if}} without a matching {{#if}}", open)
      }
    } else if (IF_BLOCK.test(content)) {
      if (stack.length >= limits.maxDepth) {
        source.fail("tooDeep", "Conditions are nested too deeply", open)
      }
      const inner = content.slice(3)
      const tokens = lex(source, inner, offset + 3)
      const cursor = new Cursor(source, tokens)
      const node: IfNode = {
        condition: parseCondition(cursor, roots),
        elseBody: [],
        kind: "if",
        thenBody: [],
      }
      add(node, open)
      stack.push({ elseBody: null, node, opened: open })
    } else if (content.startsWith("#") || content.startsWith("/")) {
      source.fail(
        "unknownBlock",
        `Unknown block "{{${content.split(WHITESPACE_CHAR)[0]}}}". Only #if, else and /if exist`,
        open,
      )
    } else {
      const cursor = new Cursor(source, lex(source, content, offset))
      const operand = parseOperand(cursor, roots)
      const filters = parseFilters(source, cursor, limits)
      cursor.expectEnd()
      add({ filters, kind: "output", operand }, open)
    }
  }
  const unclosed = stack.at(-1)
  if (unclosed) {
    source.fail(
      "unclosedIf",
      "{{#if}} is never closed with {{/if}}",
      unclosed.opened,
    )
  }
  return { nodeCount, nodes: root, variables: [...roots] }
}
