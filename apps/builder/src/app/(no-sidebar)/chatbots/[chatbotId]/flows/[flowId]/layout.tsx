import type { ReactNode } from "react"

export default async function FlowDetailLayout({
  children,
}: {
  children: ReactNode
}) {
  return <div className="w-screen h-screen flex flex-col">{children}</div>
}
