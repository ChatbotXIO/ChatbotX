import type { ReactNode } from "react"
import { ThemeSwitcher } from "@/components/theme-switcher"

export const AccountDeletionShell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
    <div className="w-full max-w-md">{children}</div>

    <div className="fixed inset-e-2 bottom-2">
      <ThemeSwitcher />
    </div>
  </div>
)
