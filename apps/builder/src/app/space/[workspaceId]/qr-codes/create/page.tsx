import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { CreateQrCodeForm } from "@/features/qr-codes/create-qr-code-form"

export default async function CreateQrCodePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("tools.title"),
            href: `/space/${workspaceId}/tools`,
          },
          {
            label: t("qrCodes.title"),
            href: `/space/${workspaceId}/qr-codes`,
          },
          { label: t("actions.create"), href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <CreateQrCodeForm workspaceId={workspaceId} />
      </FlowStoreProvider>
    </div>
  )
}
