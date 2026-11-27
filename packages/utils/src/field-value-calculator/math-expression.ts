/**
 * Safe arithmetic for the "Use custom formula" number operation. A tokenizer,
 * a recursive-descent parser and an evaluator: no `eval`, no `Function`, and it
 * never throws (any failure is `{ ok: false }`).
 *
 * Grammar (lowest to highest precedence):
 *   additive       := multiplicative (("+" | "-") multiplicative)*
 *   multiplicative := unary (("*" | "/" | "%") unary)*
 *   unary          := ("+" | "-") unary | primary
 *   primary        := number | name | name "(" [additive ("," additive)*] ")"
 *                   | "(" additive ")"
 */

export type MathResult = { ok: true; value: number } | { ok: false }

export const MATH_EXPRESSION_LIMITS = {
  maxLength: 1000,
  maxTokens: 256,
  maxDepth: 32,
  maxArguments: 16,
} as const

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "operator"; value: string }

type MathNode =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: string }
  | { kind: "unary"; operator: string; operand: MathNode }
  | { kind: "binary"; operator: string; left: MathNode; right: MathNode }
  | { kind: "call"; name: string; args: MathNode[] }

class MathExpressionError extends Error {}

const fail = (): never => {
  throw new MathExpressionError()
}

const TOKEN_PATTERN =
  /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z_][a-z0-9_]*)|([-+*/%(),]))/y

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = []
  TOKEN_PATTERN.lastIndex = 0
  while (TOKEN_PATTERN.lastIndex < source.length) {
    const start = TOKEN_PATTERN.lastIndex
    const match = TOKEN_PATTERN.exec(source)
    if (!match) {
      // Only trailing whitespace may remain unmatched.
      if (source.slice(start).trim() === "") {
        break
      }
      return fail()
    }
    const [, numberText, name, operator] = match
    if (numberText !== undefined) {
      const value = Number(numberText)
      if (!Number.isFinite(value)) {
        return fail()
      }
      tokens.push({ kind: "number", value })
    } else if (name !== undefined) {
      tokens.push({ kind: "name", value: name })
    } else if (operator !== undefined) {
      tokens.push({ kind: "operator", value: operator })
    }
    if (tokens.length > MATH_EXPRESSION_LIMITS.maxTokens) {
      return fail()
    }
  }
  return tokens
}

const parse = (tokens: Token[]): MathNode => {
  let position = 0
  let depth = 0

  const peekOperator = (): string | undefined => {
    const token = tokens[position]
    return token?.kind === "operator" ? token.value : undefined
  }
  const expectOperator = (operator: string): void => {
    if (peekOperator() !== operator) {
      fail()
    }
    position += 1
  }
  const enter = (): void => {
    depth += 1
    if (depth > MATH_EXPRESSION_LIMITS.maxDepth) {
      fail()
    }
  }

  const parseBinaryLevel =
    (operators: readonly string[], next: () => MathNode) => (): MathNode => {
      let left = next()
      let operator = peekOperator()
      while (operator !== undefined && operators.includes(operator)) {
        position += 1
        left = { kind: "binary", operator, left, right: next() }
        operator = peekOperator()
      }
      return left
    }

  const parseArguments = (): MathNode[] => {
    const args: MathNode[] = []
    if (peekOperator() === ")") {
      return args
    }
    args.push(parseAdditive())
    while (peekOperator() === ",") {
      position += 1
      args.push(parseAdditive())
      if (args.length > MATH_EXPRESSION_LIMITS.maxArguments) {
        fail()
      }
    }
    return args
  }

  const parsePrimary = (): MathNode => {
    const token = tokens[position]
    position += 1
    if (token?.kind === "number") {
      return { kind: "number", value: token.value }
    }
    if (token?.kind === "name") {
      if (peekOperator() !== "(") {
        return { kind: "variable", name: token.value }
      }
      position += 1
      const args = parseArguments()
      expectOperator(")")
      return { kind: "call", name: token.value, args }
    }
    if (token?.kind === "operator" && token.value === "(") {
      const inner = parseAdditive()
      expectOperator(")")
      return inner
    }
    return fail()
  }

  const parseUnary = (): MathNode => {
    const operator = peekOperator()
    if (operator === "-" || operator === "+") {
      position += 1
      enter()
      const operand = parseUnary()
      depth -= 1
      return { kind: "unary", operator, operand }
    }
    return parsePrimary()
  }

  const parseMultiplicative = parseBinaryLevel(["*", "/", "%"], parseUnary)
  const parseAdditive = (): MathNode => {
    enter()
    const node = parseBinaryLevel(["+", "-"], parseMultiplicative)()
    depth -= 1
    return node
  }

  const root = parseAdditive()
  if (position !== tokens.length) {
    return fail()
  }
  return root
}

type MathFunction = {
  min: number
  max: number
  apply: (args: number[]) => number
}

const fixed = (apply: (value: number) => number): MathFunction => ({
  min: 1,
  max: 1,
  apply: ([value]) => apply(value as number),
})

/** Lowercase keys in a `Map`, so prototype keys can never resolve. */
const MATH_FUNCTIONS = new Map<string, MathFunction>([
  ["abs", fixed(Math.abs)],
  ["ceil", fixed(Math.ceil)],
  ["floor", fixed(Math.floor)],
  ["round", fixed(Math.round)],
  ["sqrt", fixed(Math.sqrt)],
  ["exp", fixed(Math.exp)],
  ["log", fixed(Math.log)],
  ["logten", fixed(Math.log10)],
  ["sin", fixed(Math.sin)],
  ["cos", fixed(Math.cos)],
  ["tan", fixed(Math.tan)],
  ["asin", fixed(Math.asin)],
  ["acos", fixed(Math.acos)],
  ["atan", fixed(Math.atan)],
  ["min", { min: 1, max: 16, apply: (args) => Math.min(...args) }],
  ["max", { min: 1, max: 16, apply: (args) => Math.max(...args) }],
  ["hypot", { min: 1, max: 16, apply: (args) => Math.hypot(...args) }],
  [
    "pow",
    {
      min: 2,
      max: 2,
      apply: ([base, exponent]) => (base as number) ** (exponent as number),
    },
  ],
  [
    "fmod",
    {
      min: 2,
      max: 2,
      apply: ([left, right]) => (left as number) % (right as number),
    },
  ],
])

const MATH_CONSTANTS = new Map<string, number>([
  ["pi", Math.PI],
  ["e", Math.E],
])

const BINARY_OPERATIONS = new Map<
  string,
  (left: number, right: number) => number
>([
  ["+", (left, right) => left + right],
  ["-", (left, right) => left - right],
  ["*", (left, right) => left * right],
  ["/", (left, right) => (right === 0 ? Number.NaN : left / right)],
  ["%", (left, right) => (right === 0 ? Number.NaN : left % right)],
])

const finiteOrFail = (value: number): number =>
  Number.isFinite(value) ? value : fail()

const evaluate = (
  node: MathNode,
  variables: ReadonlyMap<string, number>,
): number => {
  switch (node.kind) {
    case "number":
      return node.value
    case "variable": {
      const value = variables.get(node.name) ?? MATH_CONSTANTS.get(node.name)
      return value === undefined ? fail() : value
    }
    case "unary": {
      const operand = evaluate(node.operand, variables)
      return node.operator === "-" ? -operand : operand
    }
    case "binary": {
      const apply = BINARY_OPERATIONS.get(node.operator) ?? fail
      return finiteOrFail(
        apply(evaluate(node.left, variables), evaluate(node.right, variables)),
      )
    }
    case "call": {
      const fn = MATH_FUNCTIONS.get(node.name)
      if (!fn || node.args.length < fn.min || node.args.length > fn.max) {
        return fail()
      }
      return finiteOrFail(
        fn.apply(node.args.map((arg) => evaluate(arg, variables))),
      )
    }
    default:
      return fail()
  }
}

export const evaluateMathExpression = (
  source: string,
  variables: ReadonlyMap<string, number>,
): MathResult => {
  if (source.length > MATH_EXPRESSION_LIMITS.maxLength) {
    return { ok: false }
  }
  try {
    const tokens = tokenize(source.toLowerCase())
    if (tokens.length === 0) {
      return { ok: false }
    }
    return { ok: true, value: finiteOrFail(evaluate(parse(tokens), variables)) }
  } catch (error) {
    if (error instanceof MathExpressionError) {
      return { ok: false }
    }
    throw error
  }
}
