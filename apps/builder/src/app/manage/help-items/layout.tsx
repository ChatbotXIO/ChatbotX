import { requireActiveReseller } from "../reseller-guard"

export default async function HelpItemsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireActiveReseller()
  return children
}
