import type { ReactNode } from "react"

export default function FolderableLayout({
  children,
  folders,
}: {
  children: ReactNode
  folders: ReactNode
}) {
  return (
    <>
      {folders}
      {children}
    </>
  )
}
