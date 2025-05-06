import { Separator } from "@/components/ui/separator"
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
      <Separator className="my-4" />
      {children}
    </>
  )
}
