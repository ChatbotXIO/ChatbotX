import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import type { MentionOptions } from "@tiptap/extension-mention"
import { ReactRenderer } from "@tiptap/react"
import tippy from "tippy.js"
import type { PromptVariableListRef } from "./definition"
import VariableList from "./variable-list"

const getFilteredMentions = (
  query: string,
  listOfPromptVariables: SelectOption[],
) =>
  listOfPromptVariables.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  )

const suggestion = ({
  listOfPromptVariables,
}: {
  listOfPromptVariables: SelectOption[]
}): MentionOptions["suggestion"] => ({
  char: "{{",
  allowedPrefixes: null,
  decorationClass: "variable-suggestion",
  items: ({ query }: { query: string }) =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(getFilteredMentions(query, listOfPromptVariables))
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
