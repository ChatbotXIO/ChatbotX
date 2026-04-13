"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { SiFacebook } from "@icons-pack/react-simple-icons"
import {
  BotIcon,
  CalendarIcon,
  CardSimIcon,
  CircleQuestionMarkIcon,
  CopyIcon,
  LinkIcon,
  MapIcon,
  QrCodeIcon,
  UserCheck2Icon,
  Wand2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"

const TOOLS_CONFIG = [
  {
    id: "facebook-comment",
    labelKey: "facebookCommentAutomation.title",
    descriptionKey: "facebookCommentAutomation.description",
    icon: SiFacebook,
  },
  {
    id: "facebook-lead-ads",
    labelKey: "facebookLeadAdsAutomation.title",
    descriptionKey: "facebookLeadAdsAutomation.description",
    icon: SiFacebook,
  },
  {
    id: "reflinks",
    labelKey: "reflinks.title",
    descriptionKey: "reflinks.description",
    icon: LinkIcon,
    getLink: (id: string) => `/space/${id}/reflinks`,
  },
  {
    id: "magic-links",
    labelKey: "magicLinks.title",
    descriptionKey: "magicLinks.description",
    icon: Wand2Icon,
    getLink: (id: string) => `/space/${id}/magic-links`,
  },
  {
    id: "qr-code",
    labelKey: "qrCodeGenerator.title",
    descriptionKey: "qrCodeGenerator.description",
    icon: QrCodeIcon,
    getLink: (id: string) => `/space/${id}/qr-codes`,
  },
  {
    id: "templates",
    labelKey: "templates.title",
    descriptionKey: "templates.description",
    icon: CopyIcon,
  },
  {
    id: "appointment",
    labelKey: "appointmentScheduling.title",
    descriptionKey: "appointmentScheduling.description",
    icon: CalendarIcon,
  },
  {
    id: "questionnaires",
    labelKey: "questionnaires.title",
    descriptionKey: "questionnaires.description",
    icon: CircleQuestionMarkIcon,
  },
  {
    id: "ecommerce",
    labelKey: "ecommerce.title",
    descriptionKey: "ecommerce.description",
    icon: CardSimIcon,
  },
  {
    id: "places-near-me",
    labelKey: "placesNearMe.title",
    descriptionKey: "placesNearMe.description",
    icon: MapIcon,
  },
  {
    id: "poll-manager",
    labelKey: "pollManager.title",
    descriptionKey: "pollManager.description",
    icon: UserCheck2Icon,
  },
  {
    id: "bot-simulator",
    labelKey: "botSimulator.title",
    descriptionKey: "botSimulator.description",
    icon: BotIcon,
  },
  // {
  //   id: "webhooks",
  //   labelKey: "webhooks.title",
  //   descriptionKey: "webhooks.description",
  //   icon: UsersIcon,
  //   getLink: (id: string) => `/space/${id}/webhooks`,
  // },
] as const

export const ToolsList = () => {
  const workspaceId = useWorkspaceId()
  const t = useTranslations()
  const router = useRouter()

  const tools = useMemo(
    () =>
      TOOLS_CONFIG.map((config) => ({
        id: config.id,
        label: t(config.labelKey),
        description: t(config.descriptionKey),
        icon: config.icon,
        link:
          "getLink" in config && config.getLink
            ? config.getLink(workspaceId.toString())
            : undefined,
      })),
    [t, workspaceId],
  )

  const handleCardClick = useCallback(
    (link: string | undefined) => {
      if (link) {
        router.push(link)
      }
    },
    [router],
  )

  const handleCardKeyDown = useCallback(
    (link: string | undefined, e: React.KeyboardEvent) => {
      if (!link) {
        return
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        router.push(link)
      }
    },
    [router],
  )

  return (
    <div className="grid w-auto grid-cols-[repeat(auto-fit,minmax(200px,350px))] justify-center gap-4">
      {tools.map((tool) => {
        const isDisabled = !tool.link
        return (
          <Card
            aria-disabled={isDisabled}
            aria-label={tool.link ? tool.label : undefined}
            className={cn(
              tool.link && "cursor-pointer hover:shadow-md",
              isDisabled &&
                "pointer-events-none cursor-not-allowed opacity-60 grayscale",
            )}
            key={tool.id}
            onClick={() => handleCardClick(tool.link)}
            onKeyDown={(e) => handleCardKeyDown(tool.link, e)}
            role={tool.link ? "button" : undefined}
            tabIndex={tool.link ? 0 : undefined}
          >
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-center">
                <tool.icon className="text-primary" size={30} />
              </div>
              <div className="text-center">
                <h3 className="font-semibold">{tool.label}</h3>
                <p className="text-muted-foreground text-sm">
                  {tool.description}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
