"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  getAvatarInitials,
  getRespondAvatarUrl,
} from "@/features/contacts/utils"
import { useUserStore } from "@/features/users/provider/user-store-context"

// Pixel-perfect Respond.io 2026-05-25 (iteração 23 — Pedro):
// Popover de @mention pra comentários internos. Quando user digita "@"
// no comment textarea, abre lista flutuante de workspace members
// filtrada pela query (texto após @). Setas/Enter pra navegar, Esc
// fecha. Click insere "@nome " no textarea.
//
// Layout Respond.io (print Pedro):
// - Popover dark ~360 px de largura
// - Lista vertical scrollável
// - Cada item: avatar 28 px + nome 14 px
// - Item destacado (highlight): bg sutil + cor primary
// - Aparece ANCORADO ACIMA do textarea (acima do composer)

export type MentionItem = {
  id: string
  name: string
  image?: string | null
}

type MentionPopoverProps = {
  /** Estado controlado: posição inicial do "@" no texto (índice). null = fechado. */
  triggerIndex: number | null
  /** Query extraída do texto após "@" (já filtrada). */
  query: string
  /** Elemento âncora — geralmente o textarea ou wrapper. */
  anchorEl: HTMLElement | null
  /** Click em um item — host insere @name no texto. */
  onSelect: (item: MentionItem) => void
  /** Fechar o popover (Esc, click fora, ou após select). */
  onClose: () => void
}

export function MentionPopover({
  triggerIndex,
  query,
  anchorEl,
  onSelect,
  onClose,
}: MentionPopoverProps) {
  const { workspaceMembers } = useUserStore((state) => state)
  const [activeIndex, setActiveIndex] = useState(0)
  const popoverRef = useRef<HTMLDivElement>(null)
  const open = triggerIndex !== null

  // Lista filtrada por query (case-insensitive).
  const items: MentionItem[] = useMemo(() => {
    const q = query.toLowerCase().trim()
    const out: MentionItem[] = []
    for (const m of workspaceMembers) {
      const user = m.user
      if (!user) {
        continue
      }
      const name = user.name || "?"
      if (q && !name.toLowerCase().includes(q)) {
        continue
      }
      out.push({
        id: String(user.id),
        name,
        image: user.image ?? null,
      })
      if (out.length >= 12) {
        break
      }
    }
    return out
  }, [workspaceMembers, query])

  // Reseta active index quando query muda.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on query change
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Navegação teclado: setas / Enter / Esc.
  useEffect(() => {
    if (!open) {
      return
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const item = items[activeIndex]
        if (item) {
          onSelect(item)
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Tab") {
        e.preventDefault()
        const item = items[activeIndex]
        if (item) {
          onSelect(item)
        }
      }
    }
    document.addEventListener("keydown", handler, true)
    return () => document.removeEventListener("keydown", handler, true)
  }, [open, items, activeIndex, onSelect, onClose])

  // Click fora fecha.
  useEffect(() => {
    if (!open) {
      return
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorEl &&
        !anchorEl.contains(target)
      ) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, anchorEl, onClose])

  if (!(open && anchorEl) || items.length === 0) {
    return null
  }

  // Posicionar popover ACIMA do anchor (textarea do comment).
  // O comment box vive na parte BAIXA da tela, então abre pra cima.
  const rect = anchorEl.getBoundingClientRect()
  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    left: rect.left,
    bottom: window.innerHeight - rect.top + 8,
    width: Math.max(rect.width * 0.7, 280),
    maxHeight: 320,
    zIndex: 50,
  }

  return (
    <div
      className="overflow-y-auto rounded-md border border-white/[0.12] bg-app-surface-2 p-1 shadow-lg"
      ref={popoverRef}
      role="listbox"
      style={popoverStyle}
    >
      {items.map((item, idx) => {
        const isActive = idx === activeIndex
        const avatarSpec = getRespondAvatarUrl(item.id ?? item.name)
        const initials = getAvatarInitials(item.name) || "?"
        return (
          <button
            aria-selected={isActive}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left transition-colors",
              isActive
                ? "bg-white/[0.08] text-foreground"
                : "text-text-secondary hover:bg-white/[0.04]",
            )}
            key={item.id}
            onClick={() => onSelect(item)}
            onMouseEnter={() => setActiveIndex(idx)}
            role="option"
            type="button"
          >
            <Avatar className="size-7 shrink-0">
              <AvatarImage
                alt={item.name}
                className="object-cover"
                src={item.image ?? avatarSpec.url}
              />
              <AvatarFallback
                className="font-semibold text-[10px] text-white"
                style={{ backgroundColor: avatarSpec.color }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-[14px]">{item.name}</span>
          </button>
        )
      })}
    </div>
  )
}
