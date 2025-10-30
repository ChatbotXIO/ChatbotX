import { CustomFieldType } from "@aha.chat/database/types"
import { computePosition, flip, shift } from "@floating-ui/dom"
import type { MentionNodeAttrs } from "@tiptap/extension-mention"
import { type Editor, posToDOMRect, ReactRenderer } from "@tiptap/react"
import type { SuggestionOptions } from "@tiptap/suggestion"
import { CalendarIcon, HashIcon, TextIcon } from "lucide-react"
import { useMemo } from "react"
import VariableList, {
  type VariableListProps,
  type VariableListRef,
} from "./variable-list"

const updatePosition = (editor: Editor, element: HTMLElement) => {
  const virtualElement = {
    getBoundingClientRect: () =>
      posToDOMRect(
        editor.view,
        editor.state.selection.from,
        editor.state.selection.to,
      ),
  }

  computePosition(virtualElement, element, {
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [shift(), flip()],
  }).then(({ x, y, strategy }) => {
    element.style.width = "max-content"
    element.style.position = strategy
    element.style.left = `${x}px`
    element.style.top = `${y}px`
    element.classList.add("z-100")
  })
}

export default function createSuggestion(
  customFields: { label: string; value: string; type: string }[],
) {
  const itemOptions = useMemo(() => {
    const getIcon = (type: CustomFieldType) => {
      if (type === CustomFieldType.number) {
        return HashIcon
      }
      if (type === CustomFieldType.date || type === CustomFieldType.datetime) {
        return CalendarIcon
      }
      return TextIcon
    }

    return customFields.map((cf) => ({
      value: cf.value,
      label: cf.label,
      icon: getIcon(cf.type as CustomFieldType),
    }))
  }, [customFields])

  const suggestion: Omit<
    SuggestionOptions<{ value: string; label: string }, MentionNodeAttrs>,
    "editor"
  > = {
    char: "{{",
    items: () => itemOptions,

    render: () => {
      let component: ReactRenderer<VariableListRef, VariableListProps>

      return {
        onStart: (props) => {
          component = new ReactRenderer(VariableList, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect) {
            return
          }

          if (component.element instanceof HTMLElement) {
            component.element.style.position = "relative"
            document.body.appendChild(component.element)
            updatePosition(props.editor, component.element)
          }
        },

        onUpdate(props) {
          component.updateProps(props)

          if (!props.clientRect) {
            return
          }

          updatePosition(props.editor, component.element as HTMLElement)
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            component.destroy()

            return true
          }

          if (component.ref) {
            return component.ref.onKeyDown(props)
          }

          return false
        },

        onExit() {
          component.element.remove()
          component.destroy()
        },
      }
    },
  }

  return suggestion
}
