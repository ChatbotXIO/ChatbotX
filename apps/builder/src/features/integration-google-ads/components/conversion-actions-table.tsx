"use client"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import {
  isEnabledConversionAction,
  isExternalAttributionAction,
  isOnePerClickAction,
} from "@chatbotx.io/utils/google-click"
import { InfoIcon, TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { googleEnumLabel } from "../lib/google-enum-labels"
import type { GoogleAdsSettingsConversionAction } from "../lib/to-settings-view"
import { StatusBadge } from "./status-badge"

type NoteProps = {
  label: string
  tone: "info" | "warning"
}

/** Icon-only note: the text is the accessible name and the tooltip. */
const Note = ({ label, tone }: NoteProps) => {
  const Icon = tone === "warning" ? TriangleAlertIcon : InfoIcon
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={label}
            className={
              tone === "warning"
                ? "inline-flex rounded-sm text-amber-700 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-amber-400"
                : "inline-flex rounded-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            }
            type="button"
          />
        }
      >
        <Icon aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Compact, horizontally scrollable table of the account's synced conversion actions. */
export const ConversionActionsTable = ({
  actions,
}: {
  actions: GoogleAdsSettingsConversionAction[]
}) => {
  const t = useTranslations()
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableCaption className="sr-only">
          {t("googleAds.conversionActions.title")}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">
              {t("googleAds.conversionActions.name")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.conversionActions.category")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.conversionActions.counting")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.conversionActions.status")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {actions.map((action) => (
            <TableRow key={action.id}>
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {action.name}
                  {isExternalAttributionAction(action) ? (
                    <Note
                      label={t("googleAds.conversionActions.externalNote")}
                      tone="warning"
                    />
                  ) : null}
                </span>
              </TableCell>
              <TableCell>
                {googleEnumLabel("category", action.category, t)}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  {googleEnumLabel("countingType", action.countingType, t)}
                  {isOnePerClickAction(action) ? (
                    <Note
                      label={t("googleAds.conversionActions.onePerClickNote")}
                      tone="info"
                    />
                  ) : null}
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge
                  tone={isEnabledConversionAction(action) ? "success" : "muted"}
                >
                  {googleEnumLabel("actionStatus", action.status, t)}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
