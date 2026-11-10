import type { MentionOptions } from "@tiptap/extension-mention"
import { ReactRenderer } from "@tiptap/react"
import tippy from "tippy.js"
import type { PromptVariableListRef, PromptVariableOption } from "./definition"
import { getFilteredMentions } from "./filter-mentions"
import VariableList from "./variable-list"

const suggestion = ({
  listOfPromptVariables,
}: {
  listOfPromptVariables: PromptVariableOption[] | (() => PromptVariableOption[])
}): MentionOptions["suggestion"] => ({
  char: "{{",
  allowedPrefixes: null,
  decorationClass: "variable-suggestion",
  items: ({ query }: { query: string }) =>
    new Promise((resolve) => {
      setTimeout(() => {
        const options =
          typeof listOfPromptVariables === "function"
            ? listOfPromptVariables()
            : listOfPromptVariables
        resolve(getFilteredMentions(query, options))
      }, 150)
    }),

  render: () => {
    // Both stay undefined until `onStart` runs, which tiptap only calls after
    // `items` resolves — a key pressed in that window still reaches `onKeyDown`.
    let component: ReactRenderer | undefined
    // biome-ignore lint/suspicious/noExplicitAny: Tippy type
    let popup: any

    return {
      onStart: (props) => {
        // `items` resolves after a delay: the editor can be gone by then, and a
        // popup opened for it would never be destroyed.
        if (props.editor.isDestroyed) {
          return
        }

        component = new ReactRenderer(VariableList, {
          props,
          editor: props.editor,
        })

        popup = tippy(document.body, {
          getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        })
      },

      onUpdate(props) {
        component?.updateProps(props)

        popup?.setProps({
          getReferenceClientRect: props.clientRect,
        })
      },

      onKeyDown(props) {
        // No popup yet: let the editor handle the key itself.
        if (!(popup && component)) {
          return false
        }

        if (props.event.key === "Escape") {
          popup.hide()

          return true
        }

        return (
          (component.ref as PromptVariableListRef | null)?.onKeyDown(props) ??
          false
        )
      },

      onExit() {
        popup?.destroy()
        component?.destroy()
      },
    }
  },
})

export default suggestion
