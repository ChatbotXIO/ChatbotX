"use client"

import { useEffect } from "react"
import "./full-canvas.css"

/**
 * Layout do route group `(full-canvas)` — usado pelo flow editor (e outras
 * páginas que precisem ocupar todo o espaço sem padding).
 *
 * Por que existe: o layout pai `space/[workspaceId]/layout.tsx` aplica
 * `p-6 gap-4 overflow-auto` no `<main>` (correto pra páginas tipo dashboard,
 * settings, etc.). Mas o flow editor precisa de canvas full-bleed —
 * adicionamos `data-full-canvas="true"` no body via useEffect, e o CSS
 * sobrescreve essas regras só pra essa rota (ver `full-canvas.css`).
 *
 * Vantagem versus a rota antiga `(no-sidebar)`: aqui o AppSidebar global
 * fica visível (Pedro pediu "sidebar fixo em todas as opções, estilo
 * Respond.io"). Antes o flow editor sumia com o sidebar.
 */
export default function FullCanvasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    document.body.dataset.fullCanvas = "true"
    return () => {
      delete document.body.dataset.fullCanvas
    }
  }, [])
  return <div className="flex h-full w-full flex-col">{children}</div>
}
