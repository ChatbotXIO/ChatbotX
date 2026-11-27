import type { Editor } from "@tiptap/react"
import { useEffect } from "react"

const LOCKING_FIELDSET = "fieldset:disabled"

/**
 * A tiptap editor is `contenteditable`, which a disabled fieldset does not
 * cover. Under a disabled fieldset (a locked template region), make it
 * read-only; make it editable again once the lock clears. A surrounding
 * fieldset can flip `disabled` without this component re-rendering, so the
 * ancestors' `disabled` attributes are observed and the state re-applied then.
 */
export function useReadOnlyWhenLocked(editor: Editor | null) {
  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return
    }
    const dom = editor.view.dom
    const apply = () => {
      if (editor.isDestroyed) {
        return
      }
      const readOnly = Boolean(dom.closest(LOCKING_FIELDSET))
      if (editor.isEditable === readOnly) {
        // No update event: it would call the field's onChange (before the
        // initial content loads, with "") and dirty the form.
        editor.setEditable(!readOnly, false)
      }
    }
    apply()

    const observer = new MutationObserver(apply)
    for (let node = dom.parentElement; node; node = node.parentElement) {
      if (node instanceof HTMLFieldSetElement) {
        observer.observe(node, {
          attributes: true,
          attributeFilter: ["disabled"],
        })
      }
    }
    return () => observer.disconnect()
  }, [editor])
}
