/**
 * Spintax: a single-brace block of `|`-separated branches, e.g. `{Hi|Hello|Hey}`,
 * of which exactly one is picked at random when the text is rendered. It is the
 * sibling of — and deliberately distinct from — the double-brace variable
 * grammar in `./variables`: authors write `{Hi|Hello} {{first_name}}`, and the
 * two passes never see each other's syntax.
 *
 * A block's content may not contain a brace or a newline, so a variable
 * placeholder (`{{first_name}}`, `{{coupon:X}}`) can never be mistaken for one:
 * scanning `{{first_name}}` from its first `{` immediately hits another `{`,
 * and from its second `{` finds no `|`. Branches are plain text — a variable
 * inside a branch would introduce braces and stop the block matching at all.
 *
 * There is NO escape sequence. A literal `|` is safe anywhere outside a
 * single-brace pair; to keep one inside braces, don't wrap it in braces.
 *
 * A JSON or CSS fragment CAN legitimately look like a block (`{"a": "x|y"}`),
 * so spintax is never applied globally — each caller opts in for text it knows
 * is prose. See `resolveContactVariablesDeep`'s `spintax` option.
 */

/**
 * Content is brace-free and single-line, and must hold at least one `|`.
 * Exported as the pattern source (no flags) so each consumer builds the regex
 * it needs — global for `replace`, non-global for `test`.
 */
export const SPINTAX_BLOCK_SOURCE = String.raw`\{([^{}\n]*\|[^{}\n]*)\}`

/**
 * Cheap guards against a pathological block — a paste of pipe-separated data
 * is far likelier to be content than an author's intent. An oversized block is
 * left verbatim rather than silently collapsed to one of its parts.
 */
export const SPINTAX_MAX_BLOCK_LENGTH = 500
export const SPINTAX_MAX_BRANCHES = 20

// Non-global: `.test` stays stateless (no `lastIndex` advance between calls).
const SPINTAX_BLOCK_REGEX = new RegExp(SPINTAX_BLOCK_SOURCE)
const SPINTAX_BLOCK_REGEX_GLOBAL = new RegExp(SPINTAX_BLOCK_SOURCE, "g")

const BRANCH_SEPARATOR = "|"

/** True when `value` embeds at least one `{a|b}` spintax block. */
export const containsSpintax = (value: string): boolean =>
  SPINTAX_BLOCK_REGEX.test(value)

const pickAtRandom = (count: number): number =>
  Math.floor(Math.random() * count)

export type ApplySpintaxOptions = {
  /**
   * Chooses a branch index in `[0, count)`. Defaults to uniform random; tests
   * pass a fixed picker so they never have to stub `Math.random`.
   */
  pick?: (count: number) => number
}

/**
 * Replaces every `{a|b|c}` block with one of its branches. Each occurrence is
 * drawn independently, so `{Hi|Hello} … {Hi|Hello}` can resolve to two
 * different greetings. Branches are trimmed; an empty branch (`{Hi|}`) is
 * legitimate and renders as nothing.
 *
 * Text with no block is returned unchanged.
 */
export const applySpintax = (
  text: string,
  options: ApplySpintaxOptions = {},
): string => {
  const pick = options.pick ?? pickAtRandom

  return text.replace(
    SPINTAX_BLOCK_REGEX_GLOBAL,
    (match, content: string): string => {
      if (content.length > SPINTAX_MAX_BLOCK_LENGTH) {
        return match
      }

      const branches = content.split(BRANCH_SEPARATOR)
      if (branches.length > SPINTAX_MAX_BRANCHES) {
        return match
      }

      // A picker that returns an out-of-range index must not erase the block.
      const index = pick(branches.length)
      const branch = branches[index]

      return branch === undefined ? match : branch.trim()
    },
  )
}
