"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react"
import { createPortal } from "react-dom"

type EcommerceFooterContextValue = {
  target: HTMLDivElement | null
  /** How many pages hold the footer now; the shop link shows at 0. */
  setTakers: (update: (count: number) => number) => void
}

const EcommerceFooterContext =
  createContext<EcommerceFooterContextValue | null>(null)

/**
 * Every Ecommerce page with a bar pinned at the bottom, however far it
 * scrolls — like the Mini App editor's Public URL bar. It shows the shop link,
 * unless the page puts its own actions there (`EcommerceFooterActions`), as a
 * form does with Cancel / Save.
 */
export function EcommerceFooterLayout({
  shopLink,
  children,
}: {
  shopLink: ReactNode
  children: ReactNode
}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const [takers, setTakers] = useState(0)
  return (
    <EcommerceFooterContext.Provider value={{ target, setTakers }}>
      <div className="flex min-h-full flex-col">
        <div className="flex-1 space-y-4 p-6">{children}</div>
        <div className="sticky bottom-0 z-10 border-t bg-background px-6 py-3">
          <div ref={setTarget} />
          {takers > 0 ? null : shopLink}
        </div>
      </div>
    </EcommerceFooterContext.Provider>
  )
}

/**
 * Puts a page's own actions in the pinned bar instead of the shop link. They
 * are drawn outside the page's form, so a submit button names it with `form`.
 */
export function EcommerceFooterActions({ children }: { children: ReactNode }) {
  const footer = useContext(EcommerceFooterContext)
  const setTakers = footer?.setTakers
  useEffect(() => {
    if (!setTakers) {
      return
    }
    setTakers((count) => count + 1)
    return () => setTakers((count) => count - 1)
  }, [setTakers])
  if (!footer?.target) {
    // Outside the Ecommerce layout the actions stay where the page put them.
    return footer ? null : children
  }
  return createPortal(children, footer.target)
}
