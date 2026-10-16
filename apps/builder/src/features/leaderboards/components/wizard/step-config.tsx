"use client"

import type {
  ChannelType,
  LeaderboardPlatform,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useWatch } from "react-hook-form"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { LEADERBOARD_PLATFORM_LABEL_KEY } from "../../lib/platforms"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"
import { GeneralSettings, RewardSettings } from "./general-settings"
import { PlatformPicker } from "./platform-picker"
import { PostScopeField } from "./post-scope-field"
import { RulesEditor } from "./rules-editor"
import { TelegramChatsField } from "./telegram-chats-field"

export type LeaderboardPlatformChannels = Record<
  Exclude<LeaderboardPlatform, "gamification">,
  ChannelType
>

/** Step 2: platform → channel/minigame → scope, then rules and settings. */
export function StepConfig({
  workspaceId,
  platform,
  onPlatformChange,
  platformChannels,
  minigameOptions,
  hostLocked,
  viewUrl,
}: {
  workspaceId: string
  platform: LeaderboardPlatform
  onPlatformChange: (platform: LeaderboardPlatform) => void
  platformChannels: LeaderboardPlatformChannels
  minigameOptions: { label: string; value: string }[]
  hostLocked: boolean
  viewUrl: string | null
}) {
  const t = useTranslations()
  const inboxes = useInboxList()
  const inboxId =
    useWatch<LeaderboardWizardInput, "inboxId">({ name: "inboxId" }) ?? null
  const minigameId =
    useWatch<LeaderboardWizardInput, "minigameId">({ name: "minigameId" }) ??
    null
  const inboxOptions = useMemo(() => {
    if (platform === "gamification") {
      return []
    }
    const channel = platformChannels[platform]
    return inboxes
      .filter((inbox) => inbox.channel === channel)
      .map((inbox) => ({ label: inbox.name, value: inbox.id }))
  }, [inboxes, platform, platformChannels])
  const platformLabel = t(LEADERBOARD_PLATFORM_LABEL_KEY[platform])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("leaderboards.wizard.channelTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PlatformPicker
            disabled={hostLocked}
            onChange={onPlatformChange}
            value={platform}
          />
          {hostLocked ? (
            <p className="text-muted-foreground text-xs">
              {t("leaderboards.wizard.hostLocked")}
            </p>
          ) : null}
          {platform === "gamification" ? (
            <div className="flex flex-col gap-2">
              <ComboboxField<LeaderboardWizardInput>
                disabled={hostLocked}
                emptyText={t("actions.noRecordFound")}
                label={t("fields.minigame.label")}
                name="minigameId"
                options={minigameOptions}
                placeholder={t("actions.pleaseSelect")}
                popoverClassName="w-[var(--anchor-width)]"
                required
                searchPlaceholder={t("actions.search")}
              />
              {minigameId ? (
                <Button
                  className="w-fit"
                  nativeButton={false}
                  render={
                    <Link
                      href={`/space/${workspaceId}/minigames/${minigameId}/edit`}
                      target="_blank"
                    />
                  }
                  size="sm"
                  variant="outline"
                >
                  <ExternalLinkIcon />
                  {t("leaderboards.wizard.openMinigameSettings")}
                </Button>
              ) : null}
            </div>
          ) : (
            <ComboboxField<LeaderboardWizardInput>
              description={
                inboxOptions.length === 0
                  ? t("leaderboards.wizard.noChannel", {
                      platform: platformLabel,
                    })
                  : undefined
              }
              disabled={hostLocked}
              emptyText={t("actions.noRecordFound")}
              key={platform}
              label={t("leaderboards.wizard.hostChannel")}
              name="inboxId"
              options={inboxOptions}
              placeholder={t("actions.pleaseSelect")}
              popoverClassName="w-[var(--anchor-width)]"
              required
              searchPlaceholder={t("actions.search")}
            />
          )}
          {platform === "messenger" || platform === "instagram" ? (
            <PostScopeField platform={platform} workspaceId={workspaceId} />
          ) : null}
          {platform === "telegram" ? (
            <TelegramChatsField inboxId={inboxId} workspaceId={workspaceId} />
          ) : null}
        </CardContent>
      </Card>
      <RulesEditor platform={platform} />
      <GeneralSettings platform={platform} viewUrl={viewUrl} />
      <RewardSettings />
    </div>
  )
}
