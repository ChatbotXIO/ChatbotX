import { notFound } from "next/navigation"
import { isCloud } from "@/env"

export default function ManageEnterpriseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isCloud()) {
    notFound()
  }
  return <div>{children}</div>
}
