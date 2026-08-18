import * as React from "react"

/**
 * Viewport width, in px, below which the UI switches to its mobile layout.
 *
 * This is deliberately the same value as Tailwind's `md` breakpoint (48rem).
 * The project has no `tailwind.config.*` — it is Tailwind v4 CSS-first, themed
 * from `packages/ui/src/styles/default.css`, with no `--breakpoint-*` override
 * — so `md` is the stock 768px. Components pair a CSS `md:` branch with this
 * hook, and the two must agree or the JS and CSS halves of a responsive
 * component disagree about which layout is showing.
 *
 * Change one, change the other.
 */
export const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
