import { notFound } from "next/navigation"
import { isCloud } from "@/env"
import { requireActiveReseller } from "../reseller-guard"

export default async function ManageEnterpriseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isCloud()) {
    notFound()
  }
  await requireActiveReseller()
  return <div>{children}</div>
}
