import {
  interpolate,
  MINI_APP_ACTION_KEY,
  type MiniAppAction,
  type MiniAppNode,
  type MiniAppOption,
  type MiniAppRuntimeScope,
  readMiniAppAction,
} from "@chatbotx.io/mini-app"
import { readArray, readString } from "../../lib/props"

export type NodeViewMode = "design" | "run"

export type NodeViewProps = {
  node: MiniAppNode
  mode: NodeViewMode
  scope: MiniAppRuntimeScope
  value?: unknown
  onChange?: (value: unknown) => void
  onAction?: (action: MiniAppAction) => void
  error?: string
}

/** What every component view reads, worked out once from the node and the mode. */
export type NodeView = NodeViewProps & {
  props: Record<string, unknown>
  /** The runner takes answers; the editor only shows the component. */
  interactive: boolean
  disabled: boolean
  options: MiniAppOption[]
  label: string
  helper: string
  /** A text prop as shown: bindings as written in the editor, resolved in the runner. */
  text: (key: string) => string
  /** Runs the node's `on-click-action`, in the runner only. */
  trigger: () => void
}

export const toNodeView = (input: NodeViewProps): NodeView => {
  const props = input.node.props
  const interactive = input.mode === "run"
  const text = (key: string) =>
    input.mode === "design"
      ? readString(props[key])
      : interpolate(readString(props[key]), input.scope)
  return {
    ...input,
    props,
    interactive,
    disabled: !interactive || props.enabled === false,
    options: readArray<MiniAppOption>(props["data-source"]),
    label: text("label"),
    helper: text("helper-text") || text("description"),
    text,
    trigger: () => {
      const action = readMiniAppAction(props[MINI_APP_ACTION_KEY])
      if (action && interactive) {
        input.onAction?.(action)
      }
    },
  }
}
