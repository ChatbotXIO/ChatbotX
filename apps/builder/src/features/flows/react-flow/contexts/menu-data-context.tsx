"use client"

import { createContext, type ReactNode, useContext } from "react"

export type NodeMenuData = {
  chatbotId?: string
  data?: Record<string, unknown>
  beforeStep?: { channel?: string; [key: string]: unknown }
}

const MenuDataContext = createContext<NodeMenuData | undefined>(undefined)

export function MenuDataProvider({
  children,
  ...value
}: { children: ReactNode } & NodeMenuData) {
  return (
    <MenuDataContext.Provider value={value}>
      {children}
    </MenuDataContext.Provider>
  )
}

export function useMenuData() {
  const context = useContext(MenuDataContext)
  return context ?? {}
}
