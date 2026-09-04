import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ReactNode } from "react"

type FullBleedProps = {
  children: ReactNode
  className?: string
}

/**
 * Hands a page the whole shell viewport: no content padding, full height.
 *
 * The shell (`app/space/[workspaceId]/layout.tsx`) pads its `<main>` with
 * `p-4 md:p-6`. Surfaces that own the whole viewport — the inbox, primarily —
 * need that padding gone. Doing it inline with a bare negative margin couples
 * the page to a spacing value it cannot see: change the shell's padding and the
 * page silently gains or loses a gutter, with nothing to grep for.
 *
 * Keeping the mirror here makes the pair greppable and gives it one place to
 * change. **The margins below must stay the negation of the shell's padding.**
 *
 * The shell's `<main>` is a flex column stretched to at least the viewport, so
 * `flex-1` is what makes the height *derived* rather than a hand-copied `dvh`
 * value: a page nested here ends exactly where the shell ends, whatever else
 * (a trial banner, a deletion banner) shares the column. `min-h-0` keeps that
 * true in the other direction — the page's own content can never push the
 * column past the viewport — so a full-bleed page must scroll its overflow
 * inside its own panes.
 *
 * `flex-1` can only resolve to the viewport if some ancestor has a *definite*
 * height, and the shell's wrapper is `min-h-svh` — a floor, not a height — so
 * on its own it grows with content and the page runs off the bottom. That is
 * what `data-full-bleed` is for: the shell matches it with `:has()` and caps
 * itself at the viewport for exactly the pages that opt in, leaving every
 * ordinary (body-scrolling) page alone. **Both halves live in
 * `app/space/[workspaceId]/layout.tsx` — grep `data-full-bleed`.**
 */
export function FullBleed({ children, className }: FullBleedProps) {
  return (
    <div
      className={cn("-m-4 flex min-h-0 flex-1 flex-col md:-m-6", className)}
      data-full-bleed
    >
      {children}
    </div>
  )
}
