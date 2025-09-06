import { InputRule, mergeAttributes, Node, PasteRule } from "@tiptap/core"
import Suggestion from "@tiptap/suggestion"
import { VueRenderer } from "@tiptap/vue-3"
import { Plugin, PluginKey } from "prosemirror-state"
import tippy from "tippy.js"
import { nextTick } from "vue"
import Fallback from "./Fallback"
import Options from "./Options"
import values from "./values"

const starInputRegex = /(?:^|\s)((?:{{ ?)((?:[^}}]+))(?: ?}}))$/
const starPasteRegex = /(?:^|\s)((?:{{ ?)((?:[^}}]+))(?: ?}}))/g

const allowedVariables = Object.keys(values)

function handleRule({ state, range, match }) {
  const keyword = match[2].trim()
  let [name, fallback] = keyword.split("|", 2)
  name = name.toLocaleLowerCase()

  if (allowedVariables.indexOf(name) === -1) {
    return false
  }

  if (
    fallback &&
    fallback.substring(0, 1) === '"' &&
    fallback.substring(0, 1) === fallback.substring(fallback.length - 1)
  ) {
    fallback = fallback.substr(1, fallback.length - 1)
  }

  let addedPosition = 0
  if (match[0].substring(0, 1) === " ") {
    addedPosition = 1
  }

  state.tr.replaceWith(
    range.from + addedPosition,
    range.to,
    this.type.create({ name, fallback }),
  )
}

const Variable = Node.create({
  name: "variable",
  draggable: false,
  group: "inline",
  inline: true,
  selectable: false,
  atom: true,

  addOptions() {
    return {
      ...this.parent?.(),
      inline: true,
      draggable: false,
      HTMLAttributes: {
        class: "custom--variable",
      },
    }
  },

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute("data-name")
        },
        renderHTML: (attributes) => {
          if (!attributes.name) {
            return {}
          }

          return {
            "data-name": attributes.name,
          }
        },
      },
      fallback: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute("data-fallback")
        },
        renderHTML: (attributes) => {
          if (!attributes.fallback) {
            return {}
          }

          return {
            "data-fallback": attributes.fallback,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: `span.custom--variable[data-name="${this.name}"][data-fallback="${this.fallback}"]`,
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attributes = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
    )
    if (!node.attrs.fallback) {
      attributes.class += " variable--missing-fallback"
    }

    return ["span", attributes, `${node.attrs.name}`]
  },

  renderText({ node }) {
    if (node.attrs.fallback) {
      return `{{ ${node.attrs.name}|"${node.attrs.fallback}" }}`
    }

    return `{{ ${node.attrs.name} }}`
  },

  addKeyboardShortcuts() {
    return {
      // TODO : To review this one !
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isVariable = false
          const { selection } = state
          const { empty, anchor } = selection

          if (!empty) {
            return false
          }

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isVariable = true
              tr.insertText("{{ " + node.attrs.name, pos, pos + node.nodeSize)

              return false
            }
          })

          return isVariable
        }),
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: starInputRegex,
        handler: (state) => handleRule.call(this, state),
      }),
    ]
  },

  addPasteRules() {
    return [
      new PasteRule({
        find: starPasteRegex,
        handler: (state) => handleRule.call(this, state),
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("variable"),
        char: "{{",
        allowSpaces: true,
        command: ({ editor, range, props }) => {
          // increase range.to by one when the next node is of type "text"
          // and starts with a space character
          const nodeAfter = editor.view.state.selection.$to.nodeAfter
          const overrideSpace = nodeAfter?.text?.startsWith(" ")

          if (overrideSpace) {
            range.to += 1
          }

          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: props,
              },
            ])
            .run()
        },
        render() {
          let component
          let popup

          return {
            onStart: (props) => {
              component = new VueRenderer(Options, {
                props,
                editor: props.editor,
              })

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: props.editor.isFocus,
                interactive: true,
                trigger: "manual",
              })
            },
            onUpdate(props) {
              if (!props.editor.isFocused) return

              component.updateProps(props)
              nextTick(() => {
                if (component.ref.availableOptions.length > 0) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                  })
                  if (!popup[0].state.isVisible) {
                    popup[0].show()
                  }
                } else {
                  popup[0].hide()
                }
              })
            },
            onKeyDown(props) {
              if (props.event.key === "Escape") {
                this.onExit()
                return true
              }

              if (popup[0].state.isVisible) {
                return component.ref?.onKeyDown(props)
              }
            },
            onExit(props) {
              popup[0].destroy()
              component.destroy()
            },
          }
        },
      }),
      new Plugin({
        props: {
          handleClickOn: (view, pos, node, nodePos, event, direct) => {
            if (node.type !== this.type) return false

            let popup = null
            const component = new VueRenderer(Fallback, {
              editor: this.editor,
              props: {
                command: (fallback) => {
                  const transaction = view.state.tr.setNodeMarkup(
                    nodePos,
                    undefined,
                    { name: node.attrs.name, fallback },
                  )
                  view.dispatch(transaction)
                  popup.destroy()
                },
                ...node.attrs,
              },
            })

            popup = tippy(event.target, {
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              onDestroy() {
                component.destroy()
              },
            })
          },
        },
      }),
    ]
  },
})

export default Variable
