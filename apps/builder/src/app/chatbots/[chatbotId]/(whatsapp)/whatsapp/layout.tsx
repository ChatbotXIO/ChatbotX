import type { ReactNode } from "react"
import { SettingsTab } from "./tab"

type LayoutProps = {
  children: ReactNode
}

export default function WhatsappLayout({ children }: LayoutProps) {
  return (
    <>
      <SettingsTab />
      <div>{children}</div>
    </>
  )
}
