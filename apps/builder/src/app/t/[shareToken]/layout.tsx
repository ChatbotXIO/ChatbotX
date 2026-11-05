import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { SignInPrompt } from "@/features/templates/components/public-install-section"
import { getTenantSettings } from "@/features/tenant/utils"
import { getShareViewer } from "./share-page-data"

export default async function PublicTemplateLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ shareToken: string }>
}) {
  const { shareToken } = await params
  const [{ name, logoLightUrl, logoDarkUrl }, viewer, t] = await Promise.all([
    getTenantSettings(),
    getShareViewer(),
    getTranslations("auth"),
  ])

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <header className="w-full border-b bg-background">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center">
            <Image
              alt={name}
              className="block h-8 w-auto dark:hidden"
              height={32}
              priority={true}
              src={logoDarkUrl}
              width={108}
            />
            <Image
              alt={name}
              className="hidden h-8 w-auto dark:block"
              height={32}
              priority={true}
              src={logoLightUrl}
              width={108}
            />
          </div>
          {viewer ? null : (
            <SignInPrompt
              label={t("signIn")}
              shareToken={shareToken}
              variant="ghost"
            />
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 md:py-12">
        {children}
      </div>

      <div className="fixed inset-e-2 bottom-2">
        <ThemeSwitcher />
      </div>
    </div>
  )
}
