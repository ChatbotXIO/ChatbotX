"use client"

import {
  Table,
  TableBody,
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
import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use } from "react"
import { TokenRefreshErrorIcon } from "@/components/token-refresh-error-icon"
import { AddChannelButton } from "@/features/inboxes/components/add-channel-button"
import { useChannelConnectError } from "@/hooks/use-channel-connect-error"
import { TiktokCommentToMessage } from "./components/tiktok-comment-to-message"
import { TiktokDisconnect } from "./components/tiktok-disconnect"
import { TiktokRefreshToken } from "./components/tiktok-refresh-token"
import type { listIntegrationTiktoks } from "./queries"

type TiktokManageProps = {
  canCreate?: boolean
  isEnabled: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationTiktoks>>]>
}

export function TiktokManage({
  canCreate = true,
  isEnabled,
  workspaceId,
  promises,
}: TiktokManageProps) {
  const [{ data: integrationTiktoks }] = use(promises)
  const t = useTranslations()

  useChannelConnectError("tiktok")

  if (!isEnabled) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          {t("messages.needToAddSettings")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <AddChannelButton
          canCreate={canCreate}
          href={`/channels/create?channel=tiktok&workspaceId=${workspaceId}`}
          label={t("fields.tiktok.label")}
        />
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("fields.tiktok.commentToMessage")}</TableHead>
              <TableHead className="w-50" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationTiktoks.map((integrationTiktok) => (
              <TableRow key={integrationTiktok.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {integrationTiktok.tokenRefreshError && (
                      <TokenRefreshErrorIcon
                        message={integrationTiktok.tokenRefreshError}
                      />
                    )}
                    {/* A connection authorized before comment automation
                        shipped keeps working for DMs, so nothing else on this
                        page looks wrong — the comment events simply never
                        arrive. This is the only place that says so. */}
                    {integrationTiktok.needsReauthorization && (
                      <Tooltip>
                        <TooltipTrigger>
                          <TriangleAlertIcon
                            className="text-amber-500"
                            size={16}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t("fields.tiktok.needsReauthorizationForComments")}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {integrationTiktok.name}
                  </div>
                </TableCell>
                <TableCell>
                  <TiktokCommentToMessage
                    integrationTiktok={integrationTiktok}
                  />
                </TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <TiktokRefreshToken integrationTiktok={integrationTiktok} />
                  <TiktokDisconnect integrationTiktok={integrationTiktok} />
                </TableCell>
              </TableRow>
            ))}
            {integrationTiktoks.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>{t("messages.noData")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
