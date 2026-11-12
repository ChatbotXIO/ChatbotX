import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ProfileForm } from "@/features/account/components/profile-form"
import { DeleteAccountDialog } from "@/features/account-deletion/components/delete-account-dialog"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUserAndAllLinkedWorkspaces } from "@/lib/auth/utils"

export default async function AccountPage() {
  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    redirect("/auth/sign-in")
  }

  const t = await getTranslations("account")
  const { user } = userAndWorkspaces
  enforcePasswordCurrent(user)

  const ownedWorkspaces = userAndWorkspaces.allWorkspaceMembers
    .filter((member) => member.workspace.ownerId === user.id)
    .map((member) => ({
      id: member.workspace.id,
      name: member.workspace.name,
    }))

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="space-y-8">
        <header className="space-y-3">
          <Link
            className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href="/"
          >
            <ArrowLeftIcon
              aria-hidden="true"
              className="size-4 rtl:rotate-180"
            />
            {t("backToWorkspaces")}
          </Link>
          <div className="space-y-1">
            <h1 className="font-semibold text-2xl tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-1">
            <h2 className="font-semibold text-lg">{t("profile.title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("profile.description")}
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <ProfileForm
                user={{
                  email: user.email,
                  image: user.image,
                  name: user.name,
                }}
              />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-1">
            <h2 className="font-semibold text-lg">{t("dangerZone.title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("dangerZone.description", { count: ownedWorkspaces.length })}
            </p>
          </div>
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>{t("dangerZone.title")}</CardTitle>
              <CardDescription>
                {t("dangerZone.description", {
                  count: ownedWorkspaces.length,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountDialog ownedWorkspaces={ownedWorkspaces} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
