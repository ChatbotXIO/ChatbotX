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

/**
 * Whether the viewport is narrower than {@link MOBILE_BREAKPOINT}, or
 * `undefined` before the first client-side measurement.
 *
 * Prefer {@link useIsMobile} for anything a CSS `md:` branch could also express:
 * guessing "desktop" for one frame is invisible when the swap is only styling.
 *
 * Reach for this hook instead when the two layouts mount *different, expensive*
 * subtrees — the inbox, where a wrong first guess would mount the conversation
 * list, message list, and contact panel twice and fire their fetches twice.
 * Hold rendering until this resolves.
 */
export function useIsMobileState(): boolean | undefined {
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

  return isMobile
}

export function useIsMobile() {
  return !!useIsMobileState()
}
