import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { findQrCode } from "@/features/qr-codes/queries"
import { UpdateQrCodeForm } from "@/features/qr-codes/update-qr-code-form"

export default async function EditQrCodePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")

  if (!(workspaceId && id)) {
    return notFound()
  }

  const qrCode = await findQrCode({ workspaceId, id })
  if (!qrCode) {
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
          { label: t("actions.edit"), href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <UpdateQrCodeForm qrCode={qrCode} workspaceId={workspaceId} />
      </FlowStoreProvider>
    </div>
  )
}
