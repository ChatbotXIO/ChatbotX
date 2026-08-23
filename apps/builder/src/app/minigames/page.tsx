import { tagService } from "@chatbotx.io/business"
import {
  minigameContactService,
  minigameService,
} from "@chatbotx.io/business/minigame"
import { minigameTypes } from "@chatbotx.io/database/partials"
import { verifyMinigamePlayToken } from "@chatbotx.io/encryption/minigame-play-token"
import type { Metadata } from "next"
import type { SearchParams } from "next/dist/server/request/search-params"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { JackpotPlayScreen } from "@/features/minigames/components/play/jackpot-play-screen"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export const dynamic = "force-dynamic"

type MinigamePageProps = {
  searchParams: Promise<SearchParams>
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("minigames")
  return { title: t("title") }
}

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function MinigameNotice({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-semibold text-xl">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}

export default async function MinigamePage(props: MinigamePageProps) {
  const searchParams = await props.searchParams
  const minigameId = getParam(searchParams.minigameId)
  const token = getParam(searchParams.token)

  if (!minigameId) {
    notFound()
  }

  const minigame = await minigameService.findUnscoped(minigameId)
  if (!minigame?.enabled) {
    notFound()
  }

  const { servable } = await loadServableWorkspace(minigame.workspaceId)
  if (!servable) {
    notFound()
  }

  if (minigame.type !== minigameTypes.enum.jackpot) {
    const t = await getTranslations("minigames.play")
    return (
      <MinigameNotice
        description={t("comingSoonDescription")}
        title={t("comingSoonTitle")}
      />
    )
  }

  // The play link carries a signed, expiring token (not a raw contact id) so
  // a contact can only play as themselves — see `signMinigamePlayToken`.
  const payload = token
    ? await verifyMinigamePlayToken(token).catch(() => null)
    : null

  if (!(token && payload) || payload.workspaceId !== minigame.workspaceId) {
    const t = await getTranslations("minigames.play")
    return (
      <MinigameNotice
        description={t("forbiddenDescription")}
        title={t("forbiddenTitle")}
      />
    )
  }

  const { contactId } = payload

  const contactState = await minigameContactService.resolvePlayState({
    minigameId: minigame.id,
    contactId,
    playerSettings: minigame.playerSettings,
  })

  await tagService.attachToContact({
    workspaceId: minigame.workspaceId,
    contactId,
    tagIds: minigame.generalSettings.openerTagIds,
  })

  return (
    <JackpotPlayScreen
      contactState={contactState}
      minigame={minigame}
      token={token}
    />
  )
}
