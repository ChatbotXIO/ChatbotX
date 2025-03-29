import type { ReactNode } from "react"
import { SettingsTab } from "./tab"

interface LayoutProps {
  children: ReactNode
}

export default async function WhatsappLayout({ children }: LayoutProps) {
  return (
    <>
      <SettingsTab />
      <div>{children}</div>
    </>
  )
}
