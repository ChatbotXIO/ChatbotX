import type { Metadata } from "next"
import type { SearchParams } from "next/dist/server/request/search-params"
import { getTranslations } from "next-intl/server"
import { loadServableMiniApp } from "@/features/mini-apps/lib/public-mini-app"
import { resolveContactVariables } from "@/features/mini-apps/lib/resolve-contact-variables"
import { resolveVisitorContactId } from "@/features/mini-apps/lib/resolve-visitor-contact"
import { PublicMiniApp } from "@/features/mini-apps/runner/public-mini-app"

export const dynamic = "force-dynamic"

type MiniAppPageProps = {
  searchParams: Promise<SearchParams>
}

const getParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

// Only bigint ids reach the database lookup.
const ID_PATTERN = /^\d{1,20}$/

const loadMiniApp = async (id: string | undefined) =>
  id && ID_PATTERN.test(id) ? await loadServableMiniApp(id) : null

export async function generateMetadata(
  props: MiniAppPageProps,
): Promise<Metadata> {
  const miniApp = await loadMiniApp(getParam((await props.searchParams).id))
  const t = await getTranslations("miniApps")
  return { title: miniApp?.name ?? t("title"), robots: { index: false } }
}

export default async function MiniAppPublicPage(props: MiniAppPageProps) {
  const searchParams = await props.searchParams
  const miniApp = await loadMiniApp(getParam(searchParams.id))

  if (!miniApp) {
    const t = await getTranslations("miniApps.public")
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="font-semibold text-xl">{t("notFoundTitle")}</h1>
        <p className="text-muted-foreground">{t("notFoundDescription")}</p>
      </div>
    )
  }

  // An unresolved `{{mini_app_token}}` (link opened outside a flow) is dropped.
  const rawToken = getParam(searchParams.token)
  const token = rawToken && !rawToken.startsWith("{{") ? rawToken : undefined
  const contactId = await resolveVisitorContactId({
    token,
    workspaceId: miniApp.workspaceId,
    miniAppId: miniApp.id,
  })
  const definition = await resolveContactVariables({
    definition: miniApp.definition,
    workspaceId: miniApp.workspaceId,
    contactId: contactId ?? undefined,
  })

  return (
    <div className="flex min-h-screen justify-center bg-[#f0f2f5]">
      <div className="flex w-full max-w-md flex-col shadow-sm">
        <PublicMiniApp
          definition={definition}
          miniAppId={miniApp.id}
          resume={getParam(searchParams.resume)}
          token={token}
        />
      </div>
    </div>
  )
}
