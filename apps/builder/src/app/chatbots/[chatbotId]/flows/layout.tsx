import type { ReactNode } from "react"

export default function FlowsLayout({
  children,
  folders,
}: { children: ReactNode; folders: ReactNode }) {
  return (
    <>
      {/* {folders} */}
      {children}
    </>
  )
}
