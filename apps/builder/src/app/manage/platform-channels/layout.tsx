import { requireActiveReseller } from "../reseller-guard"

export default async function PlatformChannelsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireActiveReseller()
  return children
}
