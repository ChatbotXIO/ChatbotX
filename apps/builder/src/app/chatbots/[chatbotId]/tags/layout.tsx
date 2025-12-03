import { Separator } from "@aha.chat/ui/components/ui/separator"
import type { ReactNode } from "react"

export default function TagsLayout({
  children,
  folders,
}: {
  children: ReactNode
  folders: ReactNode
}) {
  return (
    <>
      {folders}
      <Separator />
      {children}
    </>
  )
}
