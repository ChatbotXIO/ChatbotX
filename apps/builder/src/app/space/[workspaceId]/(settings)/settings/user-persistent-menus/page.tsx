import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { UserPersistentMenuList } from "@/features/user-persistent-menus/components/user-persistent-menu-list"
import { listUserPersistentMenus } from "@/features/user-persistent-menus/queries"

export default async function UserPersistentMenusPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const { data } = await listUserPersistentMenus({ workspaceId })

  return <UserPersistentMenuList menus={data} workspaceId={workspaceId} />
}
