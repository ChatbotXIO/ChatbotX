import type { ReactNode } from "react"

export default function CustomFieldsLayout({
  children,
  folders,
  accountField,
}: {
  children: ReactNode
  folders: ReactNode
  accountField: ReactNode
}) {
  return (
    <div className="flex flex-col gap-8">
      {folders}
      {children}
      {accountField}
    </div>
  )
}
