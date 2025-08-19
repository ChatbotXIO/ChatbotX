import type { ReactNode } from "react"
import { SettingsTab } from "./tab"

type LayoutSettingProps = {
  children: ReactNode
}

export default function SettingLayout({ children }: LayoutSettingProps) {
  return (
    <>
      <SettingsTab />
      <div>{children}</div>
    </>
  )
}
