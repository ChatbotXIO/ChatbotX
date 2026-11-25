import { toSnakeCase } from "../openapi-loader"

const SENTENCE_BREAK = /(?<=[.!?])\s+/
const SCOPE_LINE = /\n?\s*Requires token scope:[^\n]*/g
const BACKTICK_OP = /`([a-zA-Z]+\.[a-zA-Z]+)`/g

type DescriptionFilter = {
  /** Drops sentences that point at operations outside the profile. */
  sanitize: (text: string) => string
  /** Applies `sanitize` to every nested `description` of a JSON Schema. */
  cleanSchema: <T>(schema: T) => T
}

/**
 * A fixed-surface profile must not tell the model to call an operation it
 * cannot reach. Every sentence naming a backticked operation id
 * (`contacts.get`) outside `allowedToolNames` is removed, as are the
 * token-scope lines that only matter to API-key callers.
 */
export const createDescriptionFilter = (
  allowedToolNames: ReadonlySet<string>,
): DescriptionFilter => {
  const sanitize = (text: string): string =>
    text
      .split(SENTENCE_BREAK)
      .filter((sentence) =>
        [...sentence.matchAll(BACKTICK_OP)].every((match) =>
          allowedToolNames.has(toSnakeCase(match[1] as string)),
        ),
      )
      .join(" ")
      .replace(SCOPE_LINE, "")
      .trim()

  const cleanNode = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(cleanNode)
    }
    if (!node || typeof node !== "object") {
      return node
    }
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      if (key === "description" && typeof value === "string") {
        const cleaned = sanitize(value)
        if (cleaned) {
          next[key] = cleaned
        }
      } else {
        next[key] = cleanNode(value)
      }
    }
    return next
  }

  return {
    sanitize,
    cleanSchema: <T>(schema: T): T => cleanNode(schema) as T,
  }
}
