import { requireActiveReseller } from "../reseller-guard"

export default async function DefaultTemplateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireActiveReseller()
  return children
}
