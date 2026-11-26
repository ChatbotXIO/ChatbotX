/**
 * The feed template language: a tiny, closed language for the text of a post
 * made from a feed item. It is pure data in, plain text out. It has no loops,
 * no includes, no functions and no way to reach anything the caller did not put
 * in the data, so a template written by a workspace member is safe to render in
 * a worker or in an Edge route. No Node imports: the module is shared by the
 * builder's router graph (AGENTS.md invariant 25).
 */

/** A value a template can read. Objects must be plain data. */
export type TemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly TemplateValue[]
  | { readonly [key: string]: TemplateValue }

export type TemplateData = { readonly [key: string]: TemplateValue }

export type PathSegment = string | number

export type TemplateOperand =
  | { kind: "path"; segments: PathSegment[] }
  | { kind: "literal"; value: string | number }

export type FilterArgument = string | number

export type FilterCall = {
  args: FilterArgument[]
  column: number
  line: number
  name: string
}

export type ComparisonOperator = "contains" | "==" | "!="

export type Condition = {
  negated: boolean
  operand: TemplateOperand
  /** Absent: a plain truthiness test. */
  comparison?: { operator: ComparisonOperator; right: TemplateOperand }
}

export type TextNode = { kind: "text"; value: string }
export type OutputNode = {
  filters: FilterCall[]
  kind: "output"
  operand: TemplateOperand
}
export type IfNode = {
  condition: Condition
  elseBody: TemplateNode[]
  kind: "if"
  thenBody: TemplateNode[]
}
export type TemplateNode = TextNode | OutputNode | IfNode

export type TemplateAst = {
  /** The variable names (first path segment) the template reads. */
  variables: string[]
  nodes: TemplateNode[]
  nodeCount: number
}

export type TemplateErrorCode =
  | "tooLong"
  | "tooComplex"
  | "tooDeep"
  | "unterminatedTag"
  | "unterminatedString"
  | "unexpectedToken"
  | "unknownFilter"
  | "badFilterArgument"
  | "unknownBlock"
  | "unclosedIf"
  | "strayEnd"
  | "badPath"
  | "outputTooLong"
  | "timeout"

/** A template problem with the place it happened (1-based line and column). */
export class FeedTemplateError extends Error {
  readonly code: TemplateErrorCode
  readonly column: number
  readonly line: number

  constructor(
    code: TemplateErrorCode,
    message: string,
    position: { column: number; line: number },
  ) {
    super(message)
    this.name = "FeedTemplateError"
    this.code = code
    this.line = position.line
    this.column = position.column
  }
}

export type TemplateLimits = {
  maxDepth: number
  maxFiltersPerOutput: number
  maxNodes: number
  maxOutputLength: number
  maxSourceLength: number
  /** Wall-clock budget of one render. */
  maxRenderMs: number
}

export const DEFAULT_TEMPLATE_LIMITS: TemplateLimits = {
  maxDepth: 4,
  maxFiltersPerOutput: 8,
  maxNodes: 300,
  maxOutputLength: 20_000,
  maxRenderMs: 100,
  maxSourceLength: 5000,
}
