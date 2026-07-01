import { notFound } from "next/navigation"
import { isCloud } from "@/env"

export default function AdminEnterpriseNonCloudLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (isCloud()) {
    notFound()
  }
  return <div>{children}</div>
}
