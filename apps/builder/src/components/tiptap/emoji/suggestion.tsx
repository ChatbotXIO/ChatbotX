import { computePosition, flip, shift } from "@floating-ui/dom"
import type { MentionNodeAttrs } from "@tiptap/extension-mention"
import { type Editor, posToDOMRect, ReactRenderer } from "@tiptap/react"
import type { SuggestionOptions } from "@tiptap/suggestion"
import EmojiList, { type EmojiListProps, type EmojiListRef } from "./emoji-list"

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

const suggestion: Omit<
  SuggestionOptions<{ value: string; label: string }, MentionNodeAttrs>,
  "editor"
> = {
  char: ":",
  items: () => [],
  render: () => {
    let component: ReactRenderer<EmojiListRef, EmojiListProps>

    return {
      onStart: (props) => {
        component = new ReactRenderer(EmojiList, {
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

export default suggestion
