const isMacModifierKey = (event: KeyboardEvent) =>
  event.metaKey || event.ctrlKey

export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable,
  )
}

export const isUndoShortcut = (event: KeyboardEvent): boolean =>
  isMacModifierKey(event) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === "z"

export const isRedoShortcut = (event: KeyboardEvent): boolean =>
  isMacModifierKey(event) &&
  !event.altKey &&
  (event.key.toLowerCase() === "y" ||
    (event.shiftKey && event.key.toLowerCase() === "z"))
