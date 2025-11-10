import { computePosition } from "@floating-ui/dom"
import type { MentionOptions } from "@tiptap/extension-mention"
import { ReactRenderer } from "@tiptap/react"
import type { EmojiListRef } from "./definition"
import { EmojiList } from "./emoji-list"

const suggestion: MentionOptions["suggestion"] = {
  items: ({ editor, query }) =>
    editor.storage.emoji.emojis
      .filter(
        ({ shortcodes, tags }) =>
          shortcodes.find((shortcode) =>
            shortcode.startsWith(query.toLowerCase()),
          ) || tags.find((tag) => tag.startsWith(query.toLowerCase())),
      )
      .slice(0, 5),

  allowSpaces: false,

  render: () => {
    let component: ReactRenderer

    function repositionComponent(clientRect: DOMRect) {
      if (!component?.element) {
        return
      }

      const virtualElement = {
        getBoundingClientRect() {
          return clientRect
        },
      }

      computePosition(virtualElement, component.element, {
        placement: "bottom-start",
      }).then((pos) => {
        Object.assign(component.element.style, {
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          position: pos.strategy === "fixed" ? "fixed" : "absolute",
        })
      })
    }

    return {
      onStart: (props) => {
        component = new ReactRenderer(EmojiList, {
          props,
          editor: props.editor,
        })

        document.body.appendChild(component.element)
        repositionComponent(props?.clientRect?.() ?? new DOMRect())
      },

      onUpdate(props) {
        component.updateProps(props)
        repositionComponent(props?.clientRect?.() ?? new DOMRect())
      },

      onKeyDown(props) {
        if (props.event.key === "Escape") {
          document.body.removeChild(component.element)
          component.destroy()

          return true
        }

        return (component.ref as EmojiListRef)?.onKeyDown(props)
      },

      onExit() {
        if (document.body.contains(component.element)) {
          document.body.removeChild(component.element)
        }
        component.destroy()
      },
    }
  },
}

export default suggestion
