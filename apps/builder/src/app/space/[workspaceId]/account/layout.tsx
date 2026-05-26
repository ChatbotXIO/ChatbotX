import type { ReactNode } from "react"
import { PersonalSettingsSidebar } from "@/features/account/personal-settings-sidebar"

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      <PersonalSettingsSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
