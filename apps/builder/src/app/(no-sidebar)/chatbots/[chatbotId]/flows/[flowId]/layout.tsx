import type { ReactNode } from "react"

type FlowDetailLayoutProps = {
  children: ReactNode
}

export default function FlowDetailLayout({ children }: FlowDetailLayoutProps) {
  return <div className="flex h-screen w-screen flex-col">{children}</div>
}
