import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AccountDeletionDetails } from "@/features/account-deletion/components/account-deletion-details"
import { AccountDeletionForm } from "@/features/account-deletion/components/account-deletion-form"
import { AccountDeletionShell } from "@/features/account-deletion/components/account-deletion-shell"
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
      <AccountDeletionShell>
        <Card>
          <CardHeader className="items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <CircleCheckIcon
                aria-hidden="true"
                className="size-6 text-muted-foreground"
              />
            </div>
            <CardTitle>{t("receivedTitle")}</CardTitle>
            <CardDescription>{t("receivedDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              className={buttonVariants({ className: "w-full" })}
              href="/auth/sign-in"
            >
              {t("backToSignIn")}
            </Link>
          </CardContent>
        </Card>
      </AccountDeletionShell>
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
    <AccountDeletionShell>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlertIcon aria-hidden="true" className="size-6" />
          </div>
          <div className="space-y-1">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
            <p className="text-muted-foreground text-sm">
              {t("signedInAs", { email: userAndWorkspaces.user.email })}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <AccountDeletionDetails
            ownedWorkspaces={ownedWorkspaces.map((member) => ({
              id: member.workspace.id,
              name: member.workspace.name,
            }))}
          />
          <Separator />
          <AccountDeletionForm />
        </CardContent>
      </Card>
    </AccountDeletionShell>
  )
}
