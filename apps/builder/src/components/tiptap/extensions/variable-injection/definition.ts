export type PromptVariable = {
  label: string
  value: string
  type: string
}

export type PromptVariableListRef = {
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean
}
