import { ThemeSwitcher } from "@/components/theme-switcher"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>

      <div className="fixed right-2 bottom-2">
        <ThemeSwitcher />
      </div>
    </div>
  )
}
