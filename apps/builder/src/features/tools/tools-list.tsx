"use client"

import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  SiFacebook,
  SiInstagram,
  SiThreads,
} from "@icons-pack/react-simple-icons"
import {
  BotIcon,
  CalendarIcon,
  CardSimIcon,
  CircleQuestionMarkIcon,
  CopyIcon,
  Gamepad2Icon,
  ImagesIcon,
  LinkIcon,
  MapIcon,
  MegaphoneIcon,
  QrCodeIcon,
  TicketPercentIcon,
  UserCheck2Icon,
  Wand2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { buildMessagingAdsToolPath } from "@/features/ads-campaign/lib/tool-path"
import { useWorkspaceId } from "@/hooks/routing"
import {
  hasWorkspacePermission,
  type WorkspacePermissionKey,
} from "@/lib/auth/permission-routes"

// Exported for tests (`__tests__/tools-list-config.test.ts`) only.
export const TOOLS_CONFIG = [
  {
    id: "facebook-comment",
    labelKey: "facebookCommentAutomation.title",
    descriptionKey: "facebookCommentAutomation.description",
    icon: SiFacebook,
    getLink: (id: string) => `/space/${id}/fb-comments`,
  },
  {
    id: "instagram-comment",
    labelKey: "instagramCommentAutomation.title",
    descriptionKey: "instagramCommentAutomation.description",
    icon: SiInstagram,
    getLink: (id: string) => `/space/${id}/ig-comments`,
  },
  {
    id: "instagram-story",
    labelKey: "instagramStoryAutomation.title",
    descriptionKey: "instagramStoryAutomation.description",
    icon: SiInstagram,
    getLink: (id: string) => `/space/${id}/ig-stories`,
  },
  {
    id: "threads-comment",
    labelKey: "threadsCommentAutomation.title",
    descriptionKey: "threadsCommentAutomation.description",
    icon: SiThreads,
    getLink: (id: string) => `/space/${id}/threads-comments`,
  },
  {
    id: "facebook-lead-ads",
    labelKey: "facebookLeadAdsAutomation.title",
    descriptionKey: "facebookLeadAdsAutomation.description",
    icon: SiFacebook,
    getLink: (id: string) => `/space/${id}/fb-lead-ads`,
  },
  {
    id: "click-to-message-ads",
    labelKey: "clickToMessageAds.title",
    descriptionKey: "clickToMessageAds.description",
    icon: MegaphoneIcon,
    permission: "superAdmin",
    getLink: (id: string) => buildMessagingAdsToolPath({ workspaceId: id }),
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
    id: "dynamic-image",
    labelKey: "dynamicImages.title",
    descriptionKey: "dynamicImages.description",
    icon: ImagesIcon,
    getLink: (id: string) => `/space/${id}/dynamic-images`,
  },
  {
    id: "templates",
    labelKey: "templates.title",
    descriptionKey: "templates.description",
    icon: CopyIcon,
    getLink: (id: string) => `/space/${id}/templates`,
  },
  {
    id: "appointment",
    labelKey: "appointmentScheduling.title",
    descriptionKey: "appointmentScheduling.description",
    icon: CalendarIcon,
    getLink: (id: string) => `/space/${id}/appointment-calendars`,
  },
  {
    id: "questionnaires",
    labelKey: "questionnaires.title",
    descriptionKey: "questionnaires.description",
    icon: CircleQuestionMarkIcon,
    getLink: (id: string) => `/space/${id}/questionnaires`,
  },
  {
    id: "ecommerce",
    labelKey: "ecommerce.title",
    descriptionKey: "ecommerce.description",
    icon: CardSimIcon,
    getLink: (id: string) => `/space/${id}/products`,
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
  {
    id: "coupons",
    labelKey: "coupons.title",
    descriptionKey: "coupons.description",
    icon: TicketPercentIcon,
    getLink: (id: string) => `/space/${id}/topic-coupons`,
  },
  {
    id: "minigames",
    labelKey: "minigames.title",
    descriptionKey: "minigames.description",
    icon: Gamepad2Icon,
    getLink: (id: string) => `/space/${id}/minigames`,
  },
  // {
  //   id: "webhooks",
  //   labelKey: "webhooks.title",
  //   descriptionKey: "webhooks.description",
  //   icon: UsersIcon,
  //   getLink: (id: string) => `/space/${id}/webhooks`,
  // },
] as const

type ToolsListProps = {
  /**
   * The current member's permissions — may be a partial object (the jsonb
   * column defaults to `{}`), which `hasWorkspacePermission` treats as
   * fail-closed, exactly like the sidebar's nav filtering (`app-sidebar.tsx`).
   */
  permissions: WorkspaceMemberPermissions
}

/**
 * A config entry declares the permission that gates its card (only
 * `click-to-message-ads` today, `superAdmin`); entries without one are
 * visible to everyone who can open the Tools page. Reuses the app-wide
 * `hasWorkspacePermission` check rather than a local visibility table so a
 * future gated card only needs a `permission` field, and an unknown flag
 * hides the card instead of leaking it.
 */
export function canShowTool(
  permission: WorkspacePermissionKey | undefined,
  permissions: WorkspaceMemberPermissions,
): boolean {
  return !permission || hasWorkspacePermission(permissions, permission)
}

export const ToolsList = ({ permissions }: ToolsListProps) => {
  const workspaceId = useWorkspaceId()
  const t = useTranslations()
  const router = useRouter()

  const tools = useMemo(
    () =>
      TOOLS_CONFIG.filter((config) => {
        const permission =
          "permission" in config ? config.permission : undefined
        return canShowTool(permission, permissions)
      }).map((config) => ({
        id: config.id,
        label: t(config.labelKey),
        description: t(config.descriptionKey),
        icon: config.icon,
        link:
          "getLink" in config && config.getLink
            ? config.getLink(workspaceId.toString())
            : undefined,
      })),
    [t, workspaceId, permissions],
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
