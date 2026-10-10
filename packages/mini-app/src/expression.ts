/**
 * A small, safe evaluator for the expressions Flow JSON allows in `If`
 * conditions, `Switch` values and text bindings:
 *
 *   ${form.age} >= 18 && (${form.plan} == 'pro' || !${form.trial})
 *
 * Supported: references (`${form.x}`, `${data.x}`, `${screen.ID.form.x}`,
 * `${screen.ID.data.x}`), number / quoted-string / boolean literals,
 * `== != > >= < <= && || !` and parentheses. Nothing is ever passed to `eval`.
 */

export interface MiniAppRuntimeScope {
  /** Screen data per screen id (unused by endpoint-less flows, kept for completeness). */
  data?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  /** Answers per screen id. */
  forms: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  /** Flow JSON id of the screen being rendered (target of `form.x`). */
  screenId: string
}

export interface MiniAppReference {
  name: string
  /** Raw text inside `${...}`. */
  raw: string
  /** Screen id when written as `screen.ID.…`, otherwise undefined (current screen). */
  screenId?: string
  source: "form" | "data"
}

const REFERENCE_PATTERN = /\$\{([^}]*)\}/g
const SCREEN_REFERENCE =
  /^screen\.([A-Za-z_][A-Za-z0-9_]*)\.(form|data)\.([A-Za-z0-9_]+)$/
const LOCAL_REFERENCE = /^(form|data)\.([A-Za-z0-9_]+)$/

export const parseReference = (raw: string): MiniAppReference | undefined => {
  const trimmed = raw.trim()
  const screenMatch = SCREEN_REFERENCE.exec(trimmed)
  if (screenMatch) {
    return {
      raw: trimmed,
      screenId: screenMatch[1],
      source: screenMatch[2] as "form" | "data",
      name: screenMatch[3] as string,
    }
  }
  const localMatch = LOCAL_REFERENCE.exec(trimmed)
  if (localMatch) {
    return {
      raw: trimmed,
      source: localMatch[1] as "form" | "data",
      name: localMatch[2] as string,
    }
  }
  return
}

/** Every `${...}` occurrence in a string; unparseable ones come back with `reference: undefined`. */
export const extractReferences = (
  text: string,
): { raw: string; reference?: MiniAppReference }[] => {
  const result: { raw: string; reference?: MiniAppReference }[] = []
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const raw = match[1] ?? ""
    result.push({ raw, reference: parseReference(raw) })
  }
  return result
}

export const resolveReference = (
  reference: MiniAppReference,
  scope: MiniAppRuntimeScope,
): unknown => {
  const screenId = reference.screenId ?? scope.screenId
  const bag = reference.source === "form" ? scope.forms : scope.data
  return bag?.[screenId]?.[reference.name]
}

type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "reference"; value: MiniAppReference }
  | { kind: "operator"; value: string }
  | { kind: "paren"; value: "(" | ")" }

export class MiniAppExpressionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MiniAppExpressionError"
  }
}

const OPERATORS = ["==", "!=", ">=", "<=", "&&", "||", ">", "<", "!"]
const NUMBER_PATTERN = /^-?\d+(\.\d+)?/
const WORD_PATTERN = /^[A-Za-z_]+/
const WHITESPACE_PATTERN = /\s/

const readQuoted = (input: string, start: number): [string, number] => {
  const quote = input[start]
  let value = ""
  let index = start + 1
  while (index < input.length && input[index] !== quote) {
    if (input[index] === "\\" && index + 1 < input.length) {
      index++
    }
    value += input[index]
    index++
  }
  if (index >= input.length) {
    throw new MiniAppExpressionError("unterminated_string")
  }
  return [value, index + 1]
}

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = []
  let index = 0
  while (index < input.length) {
    const char = input[index] as string
    if (WHITESPACE_PATTERN.test(char)) {
      index++
      continue
    }
    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char })
      index++
      continue
    }
    if (char === "'" || char === '"') {
      const [value, next] = readQuoted(input, index)
      tokens.push({ kind: "string", value })
      index = next
      continue
    }
    if (char === "$" && input[index + 1] === "{") {
      const end = input.indexOf("}", index)
      if (end === -1) {
        throw new MiniAppExpressionError("unterminated_reference")
      }
      const reference = parseReference(input.slice(index + 2, end))
      if (!reference) {
        throw new MiniAppExpressionError("invalid_reference")
      }
      tokens.push({ kind: "reference", value: reference })
      index = end + 1
      continue
    }
    const rest = input.slice(index)
    const operator = OPERATORS.find((candidate) => rest.startsWith(candidate))
    const previous = tokens.at(-1)
    const numberMatch = NUMBER_PATTERN.exec(rest)
    // A leading "-" is a sign only where an operand is expected.
    const expectsOperand =
      !previous ||
      previous.kind === "operator" ||
      (previous.kind === "paren" && previous.value === "(")
    if (numberMatch && (char !== "-" || expectsOperand)) {
      tokens.push({ kind: "number", value: Number(numberMatch[0]) })
      index += numberMatch[0].length
      continue
    }
    if (operator) {
      tokens.push({ kind: "operator", value: operator })
      index += operator.length
      continue
    }
    const wordMatch = WORD_PATTERN.exec(rest)
    if (wordMatch && (wordMatch[0] === "true" || wordMatch[0] === "false")) {
      tokens.push({ kind: "boolean", value: wordMatch[0] === "true" })
      index += wordMatch[0].length
      continue
    }
    throw new MiniAppExpressionError("unexpected_token")
  }
  return tokens
}

type Node =
  | { kind: "literal"; value: unknown }
  | { kind: "reference"; value: MiniAppReference }
  | { kind: "not"; operand: Node }
  | { kind: "binary"; operator: string; left: Node; right: Node }

const BINARY_LEVELS: readonly (readonly string[])[] = [
  ["||"],
  ["&&"],
  ["==", "!="],
  [">", ">=", "<", "<="],
]

const parse = (tokens: Token[]): Node => {
  let position = 0
  const peek = () => tokens[position]

  const parsePrimary = (): Node => {
    const token = tokens[position++]
    if (!token) {
      throw new MiniAppExpressionError("unexpected_end")
    }
    switch (token.kind) {
      case "number":
      case "string":
      case "boolean":
        return { kind: "literal", value: token.value }
      case "reference":
        return { kind: "reference", value: token.value }
      case "paren": {
        if (token.value !== "(") {
          throw new MiniAppExpressionError("unexpected_token")
        }
        const inner = parseLevel(0)
        const closing = tokens[position++]
        if (closing?.kind !== "paren" || closing.value !== ")") {
          throw new MiniAppExpressionError("missing_parenthesis")
        }
        return inner
      }
      case "operator":
        if (token.value === "!") {
          return { kind: "not", operand: parsePrimary() }
        }
        throw new MiniAppExpressionError("unexpected_token")
      default:
        throw new MiniAppExpressionError("unexpected_token")
    }
  }

  const parseLevel = (level: number): Node => {
    if (level >= BINARY_LEVELS.length) {
      return parsePrimary()
    }
    let left = parseLevel(level + 1)
    let token = peek()
    while (
      token?.kind === "operator" &&
      BINARY_LEVELS[level]?.includes(token.value)
    ) {
      position++
      const right = parseLevel(level + 1)
      left = { kind: "binary", operator: token.value, left, right }
      token = peek()
    }
    return left
  }

  const root = parseLevel(0)
  if (position !== tokens.length) {
    throw new MiniAppExpressionError("unexpected_token")
  }
  return root
}

export const isTruthy = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return Boolean(value)
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value
  }
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value)
  }
  return
}

const looseEquals = (left: unknown, right: unknown): boolean => {
  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return leftNumber === rightNumber
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    return isTruthy(left) === isTruthy(right)
  }
  return String(left ?? "") === String(right ?? "")
}

const compare = (operator: string, left: unknown, right: unknown): boolean => {
  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)
  if (leftNumber === undefined || rightNumber === undefined) {
    return false
  }
  switch (operator) {
    case ">":
      return leftNumber > rightNumber
    case ">=":
      return leftNumber >= rightNumber
    case "<":
      return leftNumber < rightNumber
    default:
      return leftNumber <= rightNumber
  }
}

const evaluateNode = (node: Node, scope: MiniAppRuntimeScope): unknown => {
  switch (node.kind) {
    case "literal":
      return node.value
    case "reference":
      return resolveReference(node.value, scope)
    case "not":
      return !isTruthy(evaluateNode(node.operand, scope))
    default: {
      if (node.operator === "&&") {
        return (
          isTruthy(evaluateNode(node.left, scope)) &&
          isTruthy(evaluateNode(node.right, scope))
        )
      }
      if (node.operator === "||") {
        return (
          isTruthy(evaluateNode(node.left, scope)) ||
          isTruthy(evaluateNode(node.right, scope))
        )
      }
      const left = evaluateNode(node.left, scope)
      const right = evaluateNode(node.right, scope)
      if (node.operator === "==") {
        return looseEquals(left, right)
      }
      if (node.operator === "!=") {
        return !looseEquals(left, right)
      }
      return compare(node.operator, left, right)
    }
  }
}

const stripBackticks = (expression: string): string => {
  const trimmed = expression.trim()
  return trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")
    ? trimmed.slice(1, -1)
    : trimmed
}

/** Throws `MiniAppExpressionError` when the expression cannot be parsed. */
export const assertValidExpression = (expression: string): void => {
  parse(tokenize(stripBackticks(expression)))
}

export const isValidExpression = (expression: string): boolean => {
  try {
    assertValidExpression(expression)
    return true
  } catch {
    return false
  }
}

/** Evaluates an expression; an unparseable expression evaluates to `undefined`. */
export const evaluateExpression = (
  expression: string | boolean,
  scope: MiniAppRuntimeScope,
): unknown => {
  if (typeof expression === "boolean") {
    return expression
  }
  try {
    return evaluateNode(parse(tokenize(stripBackticks(expression))), scope)
  } catch {
    return
  }
}

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return ""
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ")
  }
  if (typeof value === "object") {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Renders a text property. Plain text gets each `${...}` replaced; a
 * backtick-wrapped nested expression (Flow JSON 6.0+) is concatenated from its
 * quoted strings and references, or evaluated when it contains operators.
 */
export const interpolate = (
  text: string,
  scope: MiniAppRuntimeScope,
): string => {
  const trimmed = text.trim()
  if (trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")) {
    try {
      const tokens = tokenize(trimmed.slice(1, -1))
      const isConcatenation = tokens.every(
        (token) =>
          token.kind === "string" ||
          token.kind === "reference" ||
          token.kind === "number",
      )
      if (isConcatenation) {
        return tokens
          .map((token) =>
            token.kind === "reference"
              ? formatValue(resolveReference(token.value, scope))
              : String(token.value),
          )
          .join("")
      }
      return formatValue(evaluateNode(parse(tokens), scope))
    } catch {
      return text
    }
  }
  return text.replace(REFERENCE_PATTERN, (match, raw: string) => {
    const reference = parseReference(raw)
    return reference ? formatValue(resolveReference(reference, scope)) : match
  })
}
