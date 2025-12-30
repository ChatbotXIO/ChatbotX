"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { SiFacebook, SiMessenger } from "@icons-pack/react-simple-icons"
import {
  BotIcon,
  CalendarIcon,
  CardSimIcon,
  CircleQuestionMarkIcon,
  CopyIcon,
  Layers2Icon,
  LightbulbIcon,
  LinkIcon,
  MapIcon,
  QrCodeIcon,
  UserCheck2Icon,
  UsersIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

export const ToolsList = () => {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const router = useRouter()

  const tools = [
    {
      label: t("tools.messengerList.label"),
      description: t("tools.messengerList.description"),
      icon: SiMessenger,
    },
    {
      label: t("tools.facebookCommentAutomation.label"),
      description: t("tools.facebookCommentAutomation.description"),
      icon: SiFacebook,
    },
    {
      label: t("tools.facebookLeadAdsAutomation.label"),
      description: t("tools.facebookLeadAdsAutomation.description"),
      icon: SiFacebook,
    },
    {
      label: t("tools.triggersAndActions.label"),
      description: t("tools.triggersAndActions.description"),
      icon: LightbulbIcon,
    },
    {
      label: t("tools.dripCampaigns.label"),
      description: t("tools.dripCampaigns.description"),
      icon: Layers2Icon,
    },
    {
      label: t("tools.entryPointsLinks.label"),
      description: t("tools.entryPointsLinks.description"),
      icon: LinkIcon,
      link: `/chatbots/${chatbotId}/ref-links`,
    },
    {
      label: t("tools.QRCodeGenerator.label"),
      description: t("tools.QRCodeGenerator.description"),
      icon: QrCodeIcon,
      link: `/chatbots/${chatbotId}/qr-codes`,
    },
    {
      label: t("tools.templates.label"),
      description: t("tools.templates.description"),
      icon: CopyIcon,
    },
    {
      label: t("tools.appointmentScheduling.label"),
      description: t("tools.appointmentScheduling.description"),
      icon: CalendarIcon,
    },
    {
      label: t("tools.questionnaires.label"),
      description: t("tools.questionnaires.description"),
      icon: CircleQuestionMarkIcon,
    },
    {
      label: t("tools.ecommerce.label"),
      description: t("tools.ecommerce.description"),
      icon: CardSimIcon,
    },
    {
      label: t("tools.placesNearMe.label"),
      description: t("tools.placesNearMe.description"),
      icon: MapIcon,
    },
    {
      label: t("tools.pollManager.label"),
      description: t("tools.pollManager.description"),
      icon: UserCheck2Icon,
    },
    {
      label: t("tools.botSimulator.label"),
      description: t("tools.botSimulator.description"),
      icon: BotIcon,
    },
    {
      label: t("tools.webhooks.label"),
      description: t("tools.webhooks.description"),
      icon: UsersIcon,
    },
  ]

  return (
    <div className="grid w-auto justify-center gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,350px))]">
      {tools.map((tool, index) => (
        <Card
          className={`${tool.link ? "cursor-pointer hover:shadow-md" : ""}`}
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          key={index}
          onClick={() => {
            if (tool.link) {
              router.push(tool.link)
            }
          }}
        >
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-center">
              <tool.icon size={30} />
            </div>
            <div className="text-center">
              <h3 className="font-semibold">{tool.label}</h3>
              <p className="text-muted-foreground text-sm">
                {tool.description}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
