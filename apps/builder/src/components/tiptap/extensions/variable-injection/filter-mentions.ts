import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"

/**
 * Filters variable options for the `{{`-mention suggestion. Matches on both the
 * display label ("Full name") and the raw value ("full_name") so the token a
 * user types by hand also surfaces the matching variable.
 */
export const getFilteredMentions = (
  query: string,
  listOfPromptVariables: SelectOption[],
): SelectOption[] => {
  const normalizedQuery = query.toLowerCase()
  return listOfPromptVariables.filter(
    (item) =>
      item.label.toLowerCase().includes(normalizedQuery) ||
      String(item.value).toLowerCase().includes(normalizedQuery),
  )
}
