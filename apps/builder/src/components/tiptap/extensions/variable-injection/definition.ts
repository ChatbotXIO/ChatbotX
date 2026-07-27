import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"

export type PromptVariableOption = SelectOption & {
  group?: string
}

export type PromptVariableListRef = {
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean
}
