"use client"

import {
  collectAllNames,
  createNode,
  createScreen,
  duplicateNode,
  findNode,
  insertNode,
  type MiniAppComponentType,
  type MiniAppDefaultText,
  type MiniAppDefinition,
  type MiniAppNode,
  type MiniAppScreen,
  type MiniAppSlotAddress,
  moveNode,
  removeNode,
  removeScreen,
  updateNodeCustomField,
  updateNodeProps,
  updateNodeSlots,
} from "@chatbotx.io/mini-app"
import { createStore } from "zustand/vanilla"

const HISTORY_LIMIT = 100
/** Edits to the same node within this window collapse into one undo step. */
const COALESCE_MS = 800

export type MiniAppEditorState = {
  name: string
  definition: MiniAppDefinition
  selectedScreenKey: string
  selectedNodeId: string | null
  past: MiniAppDefinition[]
  future: MiniAppDefinition[]
  dirty: boolean
  lastEdit: { key: string; at: number } | null
}

export type MiniAppEditorActions = {
  setName: (name: string) => void
  selectScreen: (screenKey: string) => void
  selectNode: (nodeId: string | null) => void
  addNode: (
    type: MiniAppComponentType,
    text: MiniAppDefaultText,
    target?: { address: MiniAppSlotAddress; index: number },
  ) => string | undefined
  moveNode: (nodeId: string, address: MiniAppSlotAddress, index: number) => void
  removeNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => void
  updateNodeProps: (nodeId: string, props: Record<string, unknown>) => void
  updateNodeSlots: (
    nodeId: string,
    slots: Record<string, MiniAppNode[]>,
  ) => void
  setNodeCustomField: (nodeId: string, customFieldId: string | null) => void
  addScreen: (title: string) => void
  updateScreen: (
    screenKey: string,
    patch: Partial<Omit<MiniAppScreen, "key" | "children">>,
  ) => void
  removeScreen: (screenKey: string) => void
  moveScreen: (from: number, to: number) => void
  undo: () => void
  redo: () => void
  markSaved: () => void
}

export type MiniAppEditorStore = ReturnType<typeof createMiniAppEditorStore>

/** Where a new node goes when it is added by click (not dragged). */
export const resolveInsertTarget = (
  definition: MiniAppDefinition,
  screenKey: string,
  selectedNodeId: string | null,
): { address: MiniAppSlotAddress; index: number } => {
  const selected = selectedNodeId
    ? findNode(definition, selectedNodeId)
    : undefined
  if (selected && selected.screen.key === screenKey) {
    const firstSlot = selected.node.slots
      ? Object.keys(selected.node.slots)[0]
      : undefined
    if (firstSlot) {
      return {
        address: { screenKey, parentId: selected.node.id, slot: firstSlot },
        index: selected.node.slots?.[firstSlot]?.length ?? 0,
      }
    }
    return { address: selected.address, index: selected.index + 1 }
  }
  const screen = definition.screens.find(
    (candidate) => candidate.key === screenKey,
  )
  const children = screen?.children ?? []
  // Keep a root Footer last, where Meta requires it.
  const footerLast = children.at(-1)?.type === "Footer"
  return {
    address: { screenKey },
    index: footerLast ? children.length - 1 : children.length,
  }
}

export const createMiniAppEditorStore = (initial: {
  name: string
  definition: MiniAppDefinition
}) =>
  createStore<MiniAppEditorState & MiniAppEditorActions>()((set, get) => {
    const commit = (definition: MiniAppDefinition, coalesceKey?: string) => {
      const state = get()
      if (definition === state.definition) {
        return
      }
      const now = Date.now()
      const coalesce =
        coalesceKey !== undefined &&
        state.lastEdit?.key === coalesceKey &&
        now - state.lastEdit.at < COALESCE_MS
      set({
        definition,
        past: coalesce
          ? state.past
          : [...state.past, state.definition].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
        lastEdit:
          coalesceKey === undefined ? null : { key: coalesceKey, at: now },
      })
    }

    return {
      name: initial.name,
      definition: initial.definition,
      selectedScreenKey: initial.definition.screens[0]?.key ?? "",
      selectedNodeId: null,
      past: [],
      future: [],
      dirty: false,
      lastEdit: null,

      setName: (name) => set({ name, dirty: true }),
      selectScreen: (screenKey) =>
        set({ selectedScreenKey: screenKey, selectedNodeId: null }),
      selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

      addNode: (type, text, target) => {
        const { definition, selectedScreenKey, selectedNodeId } = get()
        const node = createNode(type, collectAllNames(definition), text)
        const destination =
          target ??
          resolveInsertTarget(definition, selectedScreenKey, selectedNodeId)
        const next = insertNode(
          definition,
          destination.address,
          destination.index,
          node,
        )
        if (next === definition) {
          return
        }
        commit(next)
        set({
          selectedNodeId: node.id,
          selectedScreenKey: destination.address.screenKey,
        })
        return node.id
      },

      moveNode: (nodeId, address, index) =>
        commit(moveNode(get().definition, nodeId, address, index)),

      removeNode: (nodeId) => {
        commit(removeNode(get().definition, nodeId))
        if (get().selectedNodeId === nodeId) {
          set({ selectedNodeId: null })
        }
      },

      duplicateNode: (nodeId) => {
        const result = duplicateNode(get().definition, nodeId)
        commit(result.definition)
        if (result.nodeId) {
          set({ selectedNodeId: result.nodeId })
        }
      },

      updateNodeProps: (nodeId, props) =>
        commit(
          updateNodeProps(get().definition, nodeId, props),
          `props:${nodeId}`,
        ),

      setNodeCustomField: (nodeId, customFieldId) =>
        commit(updateNodeCustomField(get().definition, nodeId, customFieldId)),

      updateNodeSlots: (nodeId, slots) =>
        commit(updateNodeSlots(get().definition, nodeId, slots)),

      addScreen: (title) => {
        const { definition } = get()
        const screen = createScreen(definition, title)
        commit({ screens: [...definition.screens, screen] })
        set({ selectedScreenKey: screen.key, selectedNodeId: null })
      },

      updateScreen: (screenKey, patch) => {
        const { definition } = get()
        commit(
          {
            screens: definition.screens.map((screen) =>
              screen.key === screenKey ? { ...screen, ...patch } : screen,
            ),
          },
          `screen:${screenKey}`,
        )
      },

      removeScreen: (screenKey) => {
        const { definition, selectedScreenKey } = get()
        const next = removeScreen(definition, screenKey)
        commit(next)
        if (selectedScreenKey === screenKey) {
          set({
            selectedScreenKey: next.screens[0]?.key ?? "",
            selectedNodeId: null,
          })
        }
      },

      moveScreen: (from, to) => {
        const screens = [...get().definition.screens]
        const [moved] = screens.splice(from, 1)
        if (!moved) {
          return
        }
        screens.splice(to, 0, moved)
        commit({ screens })
      },

      undo: () => {
        const { past, definition, future } = get()
        const previous = past.at(-1)
        if (!previous) {
          return
        }
        set({
          definition: previous,
          past: past.slice(0, -1),
          future: [definition, ...future],
          dirty: true,
          lastEdit: null,
        })
      },

      redo: () => {
        const { past, definition, future } = get()
        const [next, ...rest] = future
        if (!next) {
          return
        }
        set({
          definition: next,
          past: [...past, definition],
          future: rest,
          dirty: true,
          lastEdit: null,
        })
      },

      markSaved: () => set({ dirty: false }),
    }
  })
