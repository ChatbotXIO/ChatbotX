"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { ExternalLinkIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncGoogleAdsConversionActionsAction } from "../actions/sync-conversion-actions.action"
import { useInvalidateGoogleAds } from "../hooks/use-invalidate-google-ads"
import type { GoogleAdsSettingsView } from "../lib/to-settings-view"
import { ConversionActionsTable } from "./conversion-actions-table"
import { SettingsSection } from "./settings-section"
import { ValidateRequestDialog } from "./validate-request-dialog"

/** "Set up offline conversions using Google Click ID (GCLID)": covers creating the import conversion action. */
const GOOGLE_ADS_HELP_URL =
  "https://support.google.com/google-ads/answer/7012522"
const SKELETON_ROWS = ["a", "b", "c"]

type ConversionActionsSectionProps = {
  workspaceId: string
  setup: GoogleAdsSettingsView
}

export const ConversionActionsSection = ({
  workspaceId,
  setup,
}: ConversionActionsSectionProps) => {
  const t = useTranslations()
  const router = useRouter()
  const invalidate = useInvalidateGoogleAds()

  const { execute: sync, isPending } = useAction(
    syncGoogleAdsConversionActionsAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        await invalidate()
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const hasActions = setup.conversionActions.length > 0

  return (
    <SettingsSection
      actions={
        <>
          <ValidateRequestDialog
            actions={setup.conversionActions}
            workspaceId={workspaceId}
          />
          <Button
            disabled={isPending}
            onClick={() => sync()}
            size="sm"
            type="button"
            variant="secondary"
          >
            {isPending ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : (
              <RefreshCwIcon aria-hidden="true" />
            )}
            {t("googleAds.conversionActions.sync")}
          </Button>
        </>
      }
      description={t("googleAds.conversionActions.description")}
      title={t("googleAds.conversionActions.title")}
    >
      {isPending && !hasActions ? (
        <div
          className="flex flex-col gap-2"
          data-testid="google-ads-actions-loading"
        >
          {SKELETON_ROWS.map((row) => (
            <Skeleton className="h-9 w-full" key={row} />
          ))}
        </div>
      ) : null}
      {hasActions ? (
        <ConversionActionsTable actions={setup.conversionActions} />
      ) : null}
      {hasActions || isPending ? null : (
        <p className="text-muted-foreground text-sm">
          {t("googleAds.conversionActions.empty")}{" "}
          <a
            className="inline-flex items-center gap-1 underline underline-offset-4"
            href={GOOGLE_ADS_HELP_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("googleAds.conversionActions.helpLink")}
            <ExternalLinkIcon aria-hidden="true" className="size-3" />
          </a>
        </p>
      )}
    </SettingsSection>
  )
}
