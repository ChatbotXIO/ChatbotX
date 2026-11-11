import { requireActiveReseller } from "../reseller-guard"

export default async function TemplateStoreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireActiveReseller()
  return children
}
