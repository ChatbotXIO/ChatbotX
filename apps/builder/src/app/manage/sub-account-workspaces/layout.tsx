import { requireActiveReseller } from "../reseller-guard"

export default async function SubAccountWorkspacesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireActiveReseller()
  return children
}
