import type { ReactNode } from "react"

export default function CustomFieldsLayout({
  children,
  folders,
}: { children: ReactNode; folders: ReactNode }) {
  return (
    <>
      {folders}
      {children}
    </>
  )
}
