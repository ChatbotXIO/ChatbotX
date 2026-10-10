import { act } from "react"

/** Lets tiptap's async editor creation and ProseMirror's mutation observer settle. */
export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

/**
 * Types into a ProseMirror `contenteditable` by mutating its DOM, which is the
 * path ProseMirror reads real input through (jsdom has no `beforeinput`).
 */
export const typeInto = async (editable: HTMLElement, text: string) => {
  const paragraph = editable.querySelector("p")
  if (!paragraph) {
    throw new Error("editor paragraph not found")
  }
  await act(async () => {
    paragraph.textContent = text
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}
