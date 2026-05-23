import { notFound } from "next/navigation"
import { isCommunity } from "@/env"

export default function ManageEnterpriseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (isCommunity()) {
    notFound()
  }
  return <div>{children}</div>
}
