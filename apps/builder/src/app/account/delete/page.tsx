import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AccountDeletionForm } from "@/features/account-deletion/components/account-deletion-form"
import { getCurrentUserAndAllLinkedWorkspaces } from "@/lib/auth/utils"

export default async function AccountDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>
}) {
  const t = await getTranslations("accountDeletion")
  const { requested } = await searchParams
  if (requested === "1") {
    return (
      <main className="mx-auto max-w-xl space-y-4 px-6 py-16">
        <h1 className="font-semibold text-2xl">{t("receivedTitle")}</h1>
        <p className="text-muted-foreground">{t("receivedDescription")}</p>
      </main>
    )
  }

  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    redirect("/auth/sign-in")
  }

  const ownedWorkspaces = userAndWorkspaces.allWorkspaceMembers.filter(
    (member) => member.workspace.ownerId === userAndWorkspaces.user.id,
  )

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {ownedWorkspaces.map((member) => (
          <li key={member.workspace.id}>{member.workspace.name}</li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">{t("warning")}</p>
      <AccountDeletionForm />
    </main>
  )
}
