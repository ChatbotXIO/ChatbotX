"use client"

import { findScreen, type MiniAppScreen } from "@chatbotx.io/mini-app"
import { createContext, type ReactNode, useContext, useState } from "react"
import { useStore } from "zustand"
import {
  createMiniAppEditorStore,
  type MiniAppEditorActions,
  type MiniAppEditorState,
  type MiniAppEditorStore,
} from "./editor-store"

const MiniAppEditorContext = createContext<MiniAppEditorStore | null>(null)

export function MiniAppEditorProvider({
  initial,
  children,
}: {
  initial: Parameters<typeof createMiniAppEditorStore>[0]
  children: ReactNode
}) {
  const [store] = useState(() => createMiniAppEditorStore(initial))
  return (
    <MiniAppEditorContext.Provider value={store}>
      {children}
    </MiniAppEditorContext.Provider>
  )
}

export function useMiniAppEditor<T>(
  selector: (state: MiniAppEditorState & MiniAppEditorActions) => T,
): T {
  const store = useContext(MiniAppEditorContext)
  if (!store) {
    throw new Error(
      "useMiniAppEditor must be used inside MiniAppEditorProvider",
    )
  }
  return useStore(store, selector)
}

/** The screen the editor shows, or undefined while none is selected. */
export function useSelectedScreen(): MiniAppScreen | undefined {
  return useMiniAppEditor((state) =>
    findScreen(state.definition, state.selectedScreenKey),
  )
}
