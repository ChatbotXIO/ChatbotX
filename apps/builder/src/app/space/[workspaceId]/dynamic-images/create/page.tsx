import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { CreateDynamicImageForm } from "@/features/dynamic-images/create-dynamic-image-form"

export default async function CreateDynamicImagePage({
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
            label: t("dynamicImages.title"),
            href: `/space/${workspaceId}/dynamic-images`,
          },
          { label: t("actions.create"), href: "" },
        ]}
      />
      <CustomFieldStoreProvider workspaceId={workspaceId}>
        <CreateDynamicImageForm workspaceId={workspaceId} />
      </CustomFieldStoreProvider>
    </div>
  )
}
