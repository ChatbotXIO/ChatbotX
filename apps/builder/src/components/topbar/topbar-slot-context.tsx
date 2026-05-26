"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react"

/**
 * Sistema de slots pro topbar global (`WorkspaceTopbar`).
 *
 * Cada página pode injetar conteúdo dinâmico em 3 zonas do topbar:
 *  - `pageTitle`: lado esquerdo, depois do brand. Ex.: "Fluxos", "Caixa de
 *    entrada", "< nome do flow + pencil"
 *  - `pageActions`: lado direito, antes do user menu. Ex.: "+ Adicionar
 *    workflow", "Filtros", "Publicar / Teste"
 *
 * Como funciona:
 *  - O layout pai (`space/[workspaceId]/layout.tsx`) renderiza
 *    `<TopbarSlotProvider>` no topo
 *  - O `WorkspaceTopbar` lê do Context e renderiza as zonas
 *  - Cada página chama `useTopbarSlot({ pageTitle, pageActions })` pra
 *    registrar seu conteúdo — automaticamente removido ao desmontar
 *
 * Suporte a múltiplos consumers: cada consumer tem um ID interno. O slot
 * exibido é do consumer MAIS RECENTE (LIFO) — útil quando há nested layouts.
 */

type SlotKey = "pageTitle" | "pageActions"
type Slot = { id: string; node: ReactNode }
type SlotStacks = Record<SlotKey, Slot[]>

const initialStacks: SlotStacks = {
  pageTitle: [],
  pageActions: [],
}

type TopbarContextValue = {
  stacks: SlotStacks
  push: (id: string, slots: Partial<Record<SlotKey, ReactNode>>) => void
  remove: (id: string) => void
}

const TopbarContext = createContext<TopbarContextValue | null>(null)

export function TopbarSlotProvider({ children }: { children: ReactNode }) {
  const [stacks, setStacks] = useState<SlotStacks>(initialStacks)

  const push = useCallback(
    (id: string, slots: Partial<Record<SlotKey, ReactNode>>) => {
      setStacks((prev) => {
        const next: SlotStacks = {
          pageTitle: prev.pageTitle.filter((s) => s.id !== id),
          pageActions: prev.pageActions.filter((s) => s.id !== id),
        }
        if (slots.pageTitle !== undefined) {
          next.pageTitle.push({ id, node: slots.pageTitle })
        }
        if (slots.pageActions !== undefined) {
          next.pageActions.push({ id, node: slots.pageActions })
        }
        return next
      })
    },
    [],
  )

  const remove = useCallback((id: string) => {
    setStacks((prev) => ({
      pageTitle: prev.pageTitle.filter((s) => s.id !== id),
      pageActions: prev.pageActions.filter((s) => s.id !== id),
    }))
  }, [])

  const value = useMemo(
    () => ({ stacks, push, remove }),
    [stacks, push, remove],
  )

  return (
    <TopbarContext.Provider value={value}>{children}</TopbarContext.Provider>
  )
}

/**
 * Hook pra páginas injetarem conteúdo no topbar. Conteúdo registrado é
 * removido automaticamente quando o componente desmontar.
 *
 * Importante: passe `nodes` que são estáveis entre renders (use `useMemo`
 * ou componentes inteiros, evite criar arrays/objetos inline). Caso
 * contrário, o useEffect re-registra a cada render — overhead pequeno mas
 * desnecessário.
 */
export function useTopbarSlot(slots: Partial<Record<SlotKey, ReactNode>>) {
  const ctx = useContext(TopbarContext)
  const id = useId()

  // Memoizar slots estabilizando a referência (chaves ordenadas)
  const stableSlots = useMemo(
    () => ({
      pageTitle: slots.pageTitle,
      pageActions: slots.pageActions,
    }),
    [slots.pageTitle, slots.pageActions],
  )

  useEffect(() => {
    if (!ctx) {
      return
    }
    ctx.push(id, stableSlots)
    return () => {
      ctx.remove(id)
    }
  }, [ctx, id, stableSlots])
}

/**
 * Hook usado pelo `<WorkspaceTopbar>` pra ler os slots atuais. Retorna o
 * conteúdo do topo de cada stack (LIFO) — o consumer mais recente vence.
 */
export function useTopbarStacks() {
  const ctx = useContext(TopbarContext)
  if (!ctx) {
    return { pageTitle: null, pageActions: null }
  }
  return {
    pageTitle: ctx.stacks.pageTitle.at(-1)?.node ?? null,
    pageActions: ctx.stacks.pageActions.at(-1)?.node ?? null,
  }
}
