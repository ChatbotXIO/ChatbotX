import type { ReactNode } from "react"

type LayoutSettingProps = {
  children: ReactNode
}

export default function SettingLayout({ children }: LayoutSettingProps) {
  return <>{children}</>
}
