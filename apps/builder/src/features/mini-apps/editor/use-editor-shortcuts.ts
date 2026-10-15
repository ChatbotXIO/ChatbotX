"use client"

import { useEffect } from "react"
import { useMiniAppEditor } from "./editor-context"

/** Keyboard focus is in a field, where keys belong to the text. */
const TYPING_TARGET = "input, textarea, [contenteditable=true], .cm-editor"

/**
 * Ctrl/⌘+S saves (even while typing). Outside a text field: Escape clears the
 * selection, Ctrl/⌘+Z undoes (with Shift redoes), Delete/Backspace removes
 * the selected component.
 */
export function useEditorShortcuts(save: () => void) {
  const selectedNodeId = useMiniAppEditor((state) => state.selectedNodeId)
  const undo = useMiniAppEditor((state) => state.undo)
  const redo = useMiniAppEditor((state) => state.redo)
  const removeNode = useMiniAppEditor((state) => state.removeNode)
  const selectNode = useMiniAppEditor((state) => state.selectNode)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.closest(TYPING_TARGET)
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault()
        save()
        return
      }
      if (typing) {
        return
      }
      if (event.key === "Escape") {
        selectNode(null)
        return
      }
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedNodeId
      ) {
        event.preventDefault()
        removeNode(selectedNodeId)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [save, undo, redo, removeNode, selectNode, selectedNodeId])
}
