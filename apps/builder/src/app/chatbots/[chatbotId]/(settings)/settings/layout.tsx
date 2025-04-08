import type { ReactNode } from "react"
import { SettingsTab } from "./tab"

interface LayoutSettingProps {
  children: ReactNode
}

export default async function SettingLayout({ children }: LayoutSettingProps) {
  return (
    <>
      <SettingsTab />
      <div>{children}</div>
    </>
  )
}
