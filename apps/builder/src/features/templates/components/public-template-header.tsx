import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { getTenantSettings } from "@/features/tenant/utils"
import { SignInPrompt } from "./sign-in-prompt"

type PublicTemplateHeaderProps = {
  /** Where a visitor lands after signing in: the public page that shows this header. */
  callbackUrl: string
  showSignIn: boolean
}

/** The tenant's logo and sign-in link shared by the public template pages (share link, install, store). */
export async function PublicTemplateHeader({
  callbackUrl,
  showSignIn,
}: PublicTemplateHeaderProps) {
  const [{ name, logoLightUrl, logoDarkUrl }, t] = await Promise.all([
    getTenantSettings(),
    getTranslations("auth"),
  ])

  return (
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
        {showSignIn ? (
          <SignInPrompt
            callbackUrl={callbackUrl}
            label={t("signIn")}
            variant="ghost"
          />
        ) : null}
      </div>
    </header>
  )
}
