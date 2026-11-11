import { ThemeSwitcher } from "@/components/theme-switcher"
import { PublicTemplateHeader } from "@/features/templates/components/public-template-header"
import { getShareViewer } from "../t/[shareToken]/share-page-data"

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const viewer = await getShareViewer()

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <PublicTemplateHeader callbackUrl="/store" showSignIn={!viewer} />

      <div className="mx-auto flex w-full flex-1 flex-col p-4 md:pb-12">
        {children}
      </div>

      <div className="fixed inset-e-2 bottom-2">
        <ThemeSwitcher />
      </div>
    </div>
  )
}
