/** Whether the text is a backtick-wrapped Flow JSON nested expression (`` `'Hi ' ${form.name}` ``). */
export const isNestedExpression = (text: string): boolean => {
  const trimmed = text.trim()
  return trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")
}

/** The expression inside a nested expression's backticks; any other text, trimmed. */
export const unwrapNestedExpression = (text: string): string => {
  const trimmed = text.trim()
  return isNestedExpression(trimmed) ? trimmed.slice(1, -1) : trimmed
}
