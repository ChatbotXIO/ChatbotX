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
    let component: ReactRenderer
    // biome-ignore lint/suspicious/noExplicitAny: Tippy type
    let popup: any

    return {
      onStart: (props) => {
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
        component.updateProps(props)

        popup.setProps({
          getReferenceClientRect: props.clientRect,
        })
      },

      onKeyDown(props) {
        if (props.event.key === "Escape") {
          popup.hide()

          return true
        }

        return (component.ref as PromptVariableListRef)?.onKeyDown(props)
      },

      onExit() {
        popup?.destroy()
        component?.destroy()
      },
    }
  },
})

export default suggestion
