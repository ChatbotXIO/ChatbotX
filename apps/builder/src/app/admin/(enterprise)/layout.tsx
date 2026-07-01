import { hasEnterpriseFeatures } from "@chatbotx.io/business"
import { notFound } from "next/navigation"

export default async function AdminEnterpriseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await hasEnterpriseFeatures())) {
    notFound()
  }
  return <div>{children}</div>
}
