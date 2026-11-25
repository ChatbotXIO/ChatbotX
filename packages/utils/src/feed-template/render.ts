import { getFilter, isTruthy, textOfValue } from "./filters"
import { parseTemplate } from "./parse"
import {
  DEFAULT_TEMPLATE_LIMITS,
  FeedTemplateError,
  type PathSegment,
  type TemplateAst,
  type TemplateData,
  type TemplateLimits,
  type TemplateNode,
  type TemplateOperand,
  type TemplateValue,
} from "./types"

export type RenderOptions = {
  limits?: TemplateLimits
  /** IANA zone the `date` filter formats in. Default UTC. */
  timeZone?: string
}

const hasOwn = (target: object, key: string): boolean =>
  Object.hasOwn(target, key)

/** Reads own data properties only; a missing step yields undefined, never a prototype member. */
export const lookupPath = (
  data: TemplateData,
  segments: readonly PathSegment[],
): TemplateValue => {
  let current: TemplateValue = data
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return
    }
    if (Array.isArray(current)) {
      current =
        typeof segment === "number"
          ? (current[segment] as TemplateValue)
          : undefined
    } else {
      const record = current as { readonly [key: string]: TemplateValue }
      current =
        typeof segment === "string" && hasOwn(record, segment)
          ? record[segment]
          : undefined
    }
  }
  return current
}

const NEW_LINES = /\n{3,}/g

/** Plain-text clean-up of a rendered post: no control characters, no trailing blanks, at most one blank line in a row. */
export const normaliseRendered = (text: string): string =>
  Array.from(text, (character) => {
    const code = character.charCodeAt(0)
    return (code < 32 && code !== 10 && code !== 9) || code === 127
      ? " "
      : character
  })
    .join("")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(NEW_LINES, "\n\n")
    .trim()

class Renderer {
  private readonly data: TemplateData
  private readonly deadline: number
  private length = 0
  private readonly limits: TemplateLimits
  private readonly parts: string[] = []
  private readonly timeZone: string

  constructor(data: TemplateData, options: RenderOptions) {
    this.data = data
    this.limits = options.limits ?? DEFAULT_TEMPLATE_LIMITS
    this.timeZone = options.timeZone ?? "UTC"
    this.deadline = Date.now() + this.limits.maxRenderMs
  }

  run(nodes: readonly TemplateNode[]): string {
    this.walk(nodes)
    return this.parts.join("")
  }

  private fail(code: "outputTooLong" | "timeout"): never {
    throw new FeedTemplateError(
      code,
      code === "timeout"
        ? "The template took too long to render"
        : "The rendered text is too long",
      { column: 1, line: 1 },
    )
  }

  private emit(text: string): void {
    this.length += text.length
    if (this.length > this.limits.maxOutputLength) {
      this.fail("outputTooLong")
    }
    this.parts.push(text)
  }

  /** A value that already exceeds the output cap can only grow; stop before a chain multiplies it. */
  private assertValueFits(value: TemplateValue): void {
    if (
      typeof value === "string" &&
      value.length > this.limits.maxOutputLength
    ) {
      this.fail("outputTooLong")
    }
  }

  private operand(operand: TemplateOperand): TemplateValue {
    return operand.kind === "literal"
      ? operand.value
      : lookupPath(this.data, operand.segments)
  }

  private holds(node: Extract<TemplateNode, { kind: "if" }>): boolean {
    const { condition } = node
    const left = this.operand(condition.operand)
    let result: boolean
    if (condition.comparison) {
      const right = textOfValue(this.operand(condition.comparison.right))
      const { operator } = condition.comparison
      if (operator === "contains") {
        const needle = right.toLocaleLowerCase()
        result = Array.isArray(left)
          ? left.some(
              (entry) =>
                textOfValue(entry as TemplateValue).toLocaleLowerCase() ===
                needle,
            )
          : textOfValue(left).toLocaleLowerCase().includes(needle)
      } else {
        const equal = textOfValue(left) === right
        result = operator === "==" ? equal : !equal
      }
    } else {
      result = isTruthy(left)
    }
    return condition.negated ? !result : result
  }

  private walk(nodes: readonly TemplateNode[]): void {
    for (const node of nodes) {
      if (Date.now() > this.deadline) {
        this.fail("timeout")
      }
      if (node.kind === "text") {
        this.emit(node.value)
      } else if (node.kind === "if") {
        this.walk(this.holds(node) ? node.thenBody : node.elseBody)
      } else {
        let value = this.operand(node.operand)
        for (const call of node.filters) {
          const spec = getFilter(call.name)
          if (spec) {
            value = spec.run(value, call.args, { timeZone: this.timeZone })
            this.assertValueFits(value)
          }
        }
        this.emit(textOfValue(value))
      }
    }
  }
}

/** Renders a parsed template; the result is cleaned up as plain text. */
export const renderTemplateAst = (
  ast: TemplateAst,
  data: TemplateData,
  options: RenderOptions = {},
): string => normaliseRendered(new Renderer(data, options).run(ast.nodes))

/** Parses and renders in one step. Throws {@link FeedTemplateError}. */
export const renderTemplate = (
  source: string,
  data: TemplateData,
  options: RenderOptions = {},
): string =>
  renderTemplateAst(parseTemplate(source, options.limits), data, options)

export type TemplateCheck =
  | { ok: true; variables: string[] }
  | {
      code: string
      column: number
      line: number
      message: string
      ok: false
    }

/** Whether a template parses, without throwing. */
export const checkTemplate = (
  source: string,
  limits?: TemplateLimits,
): TemplateCheck => {
  try {
    return { ok: true, variables: parseTemplate(source, limits).variables }
  } catch (error) {
    if (error instanceof FeedTemplateError) {
      return {
        code: error.code,
        column: error.column,
        line: error.line,
        message: error.message,
        ok: false,
      }
    }
    throw error
  }
}
