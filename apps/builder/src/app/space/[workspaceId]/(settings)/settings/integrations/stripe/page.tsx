import { workspaceService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageStripe } from "@/features/payment-providers/components/manage-stripe"
import { getPaymentProviders } from "@/features/payment-providers/lib/get-payment-providers"

export default async function SettingIntegrationStripePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  const workspace = workspaceId
    ? await workspaceService.find({ where: { id: workspaceId } })
    : undefined
  if (!workspace) {
    return notFound()
  }
  const { data, stripeAvailable } = await getPaymentProviders(workspace)
  return (
    <ManageStripe
      available={stripeAvailable}
      connection={data.find((row) => row.provider === "stripe") ?? null}
      workspaceId={workspace.id}
    />
  )
}
