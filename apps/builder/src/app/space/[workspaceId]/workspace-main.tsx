"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { usePathname } from "next/navigation"

const NO_PADDING_PATTERNS = [/\/products\/create/, /\/products\/[^/]+\/edit$/]

export function WorkspaceMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const noPadding = NO_PADDING_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  )

  return (
    <main className={cn("flex flex-1 flex-col gap-4", !noPadding && "p-6")}>
      {children}
    </main>
  )
}
