import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ReactNode } from "react"

type FullBleedProps = {
  children: ReactNode
  className?: string
}

/**
 * Cancels the workspace shell's content padding so a page can run edge to edge.
 *
 * The shell (`app/space/[workspaceId]/layout.tsx`) pads its `<main>` with
 * `p-4 md:p-6`. Surfaces that own the whole viewport — the inbox, primarily —
 * need that padding gone. Doing it inline with a bare negative margin couples
 * the page to a spacing value it cannot see: change the shell's padding and the
 * page silently gains or loses a gutter, with nothing to grep for.
 *
 * Keeping the mirror here makes the pair greppable and gives it one place to
 * change. **The margins below must stay the negation of the shell's padding.**
 */
export function FullBleed({ children, className }: FullBleedProps) {
  return <div className={cn("-m-4 md:-m-6", className)}>{children}</div>
}
