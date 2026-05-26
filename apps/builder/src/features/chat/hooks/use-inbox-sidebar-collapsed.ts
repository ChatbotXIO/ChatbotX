"use client"

import { useCallback, useEffect, useState } from "react"

// Persistência do collapse da InboxAreaSidebar (sidebar 215 px com
// filtros + lifecycle + teams). Quando collapsed, sidebar some inteira e
// um botão flutuante "expandir" aparece colado ao nav rail global de 48 px.
// Sincroniza entre abas via `storage` event.
const KEY = "chatbotx.inbox.sidebar.collapsed"

function read(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  return window.localStorage.getItem(KEY) === "true"
}

export function useInboxSidebarCollapsed(): [
  boolean,
  (next?: boolean) => void,
] {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(read())
    const handler = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue !== null) {
        setCollapsed(e.newValue === "true")
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  const toggle = useCallback((next?: boolean) => {
    const value = typeof next === "boolean" ? next : !read()
    window.localStorage.setItem(KEY, String(value))
    setCollapsed(value)
    // Dispatch manual pra sincronizar componentes na mesma aba.
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: KEY,
        newValue: String(value),
      }),
    )
  }, [])

  return [collapsed, toggle]
}
