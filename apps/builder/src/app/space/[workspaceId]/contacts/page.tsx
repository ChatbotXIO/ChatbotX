import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ContactsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const contactPermissionScope = await requireContactsAccess(workspaceId)
  const t = await getTranslations()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-xl">{t("contacts.title")}</h4>
        <CreateContactDialog workspaceId={workspaceId} />
      </div>

      <ContactsTable
        canViewEmailAndPhone={contactPermissionScope.canViewEmailAndPhone}
        key={workspaceId}
        workspaceId={workspaceId}
      />
    </div>
  )
}
