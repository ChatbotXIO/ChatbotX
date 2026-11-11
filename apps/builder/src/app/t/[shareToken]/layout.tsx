import { ThemeSwitcher } from "@/components/theme-switcher"
import { PublicTemplateHeader } from "@/features/templates/components/public-template-header"
import { getShareViewer } from "./share-page-data"

export default async function PublicTemplateLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ shareToken: string }>
}) {
  const { shareToken } = await params
  const viewer = await getShareViewer()

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <PublicTemplateHeader
        callbackUrl={`/t/${shareToken}`}
        showSignIn={!viewer}
      />

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 md:py-12">
        {children}
      </div>

      <div className="fixed inset-e-2 bottom-2">
        <ThemeSwitcher />
      </div>
    </div>
  )
}
