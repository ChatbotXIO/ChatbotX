import Image from "next/image"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { getTenantSettings } from "@/features/tenant/utils"

export default async function PublicTemplateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { name, logoLightUrl, logoDarkUrl } = await getTenantSettings()

  return (
    <div className="flex min-h-svh flex-col items-center bg-muted p-6 md:p-10">
      <header className="mt-4 flex w-full max-w-3xl items-center justify-center py-4">
        <Image
          alt={name}
          className="block h-12 w-auto dark:hidden"
          height={48}
          priority={true}
          src={logoDarkUrl}
          width={162}
        />
        <Image
          alt={name}
          className="hidden h-12 w-auto dark:block"
          height={48}
          priority={true}
          src={logoLightUrl}
          width={162}
        />
      </header>

      <div className="flex w-full max-w-3xl flex-1 flex-col gap-6">
        {children}
      </div>

      <div className="fixed inset-e-2 bottom-2">
        <ThemeSwitcher />
      </div>
    </div>
  )
}
