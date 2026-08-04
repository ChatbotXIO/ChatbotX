// Matches WhatsApp template placeholders: positional ({{1}}) and named
// ({{first_name}}). Kept identical to the extraction regex in
// packages/flow-config/src/steps/wa-template-utils.ts so preview substitution
// stays aligned with how each parameter's index is assigned.
const TEMPLATE_PLACEHOLDER_REGEX = /\{\{(\d+|[a-zA-Z_]+)\}\}/g

/**
 * Substitutes each placeholder in a template component's text with its mapped
 * parameter, matching parameters to placeholders by order of appearance.
 *
 * Uses a single left-to-right pass so an injected value that itself contains
 * a `{{...}}` token (a mapped variable such as `{{first_name}}`) is never
 * re-scanned and overwritten — the bug that previously collapsed every
 * placeholder to the last parameter's value.
 */
export function substituteTemplateText(
  text: string,
  params: Array<{ text?: string }>,
): string {
  let paramIndex = 0

  return text.replace(TEMPLATE_PLACEHOLDER_REGEX, (match) => {
    const replacement = params[paramIndex]?.text
    paramIndex += 1
    return replacement ? replacement : match
  })
}
