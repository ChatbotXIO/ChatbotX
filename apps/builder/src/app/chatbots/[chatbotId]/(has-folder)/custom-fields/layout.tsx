import { Separator } from "@/components/ui/separator"
import type { ReactNode } from "react"

export default function CustomFieldLayout({
  children,
  accountField,
}: {
  children: ReactNode
  accountField: ReactNode
}) {
  return (
    <>
      <Separator className="my-4" />
      {accountField}
      <Separator className="my-4" />
      {children}
    </>
  )
}
