import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { UserPersistentMenuForm } from "@/features/user-persistent-menus/components/user-persistent-menu-form"
import { findUserPersistentMenu } from "@/features/user-persistent-menus/queries"

export default async function EditUserPersistentMenuPage(props: {
  params: Promise<{ workspaceId: string; menuId: string }>
}) {
  const params = await props.params
  const workspaceId = getIdFromParams(params, "workspaceId")
  const menuId = getIdFromParams(params, "menuId")
  if (!(workspaceId && menuId)) {
    return notFound()
  }

  const menu = await findUserPersistentMenu({ id: menuId, workspaceId })
  if (!menu) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("actions.editFeature", {
            feature: t("fields.userPersistentMenu.label"),
          })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FlowStoreProvider workspaceId={workspaceId}>
          <UserPersistentMenuForm menu={menu} workspaceId={workspaceId} />
        </FlowStoreProvider>
      </CardContent>
    </Card>
  )
}
