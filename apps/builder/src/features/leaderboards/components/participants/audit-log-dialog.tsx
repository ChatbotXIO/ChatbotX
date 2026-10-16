"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { listLeaderboardAuditLogAction } from "../../actions/participant.action"

const AUDIT_ACTION_LABEL_KEY = {
  adjust: "leaderboards.auditLog.actions.adjust",
  resetOne: "leaderboards.auditLog.actions.resetOne",
  resetAll: "leaderboards.auditLog.actions.resetAll",
  ban: "leaderboards.auditLog.actions.ban",
  unban: "leaderboards.auditLog.actions.unban",
} as const

/** Immutable log of manual edits: admin, ±delta, time, contact, reason. */
export function AuditLogDialog({
  workspaceId,
  leaderboardId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  leaderboardId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard-audit-log", workspaceId, leaderboardId, page],
    queryFn: async () => {
      const result = await listLeaderboardAuditLogAction.bind(
        null,
        workspaceId,
      )({ id: leaderboardId, page })
      return result?.data ?? { data: [], total: 0, pageCount: 0 }
    },
    enabled: open,
  })
  const entries = data?.data ?? []
  const pageCount = data?.pageCount ?? 0

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("leaderboards.auditLog.title")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("leaderboards.auditLog.admin")}</TableHead>
                <TableHead>{t("leaderboards.auditLog.change")}</TableHead>
                <TableHead>{t("leaderboards.auditLog.time")}</TableHead>
                <TableHead>{t("fields.contact.label")}</TableHead>
                <TableHead>{t("leaderboards.auditLog.reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.actor?.name ??
                      entry.actor?.email ??
                      t("leaderboards.auditLog.api")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground text-xs">
                        {t(AUDIT_ACTION_LABEL_KEY[entry.action])}
                      </span>
                      {entry.delta === 0 ? null : (
                        <span
                          className={cn(
                            "font-semibold",
                            entry.delta > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-destructive",
                          )}
                        >
                          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(entry.createdAt, {
                      locale,
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    {entry.contact?.fullName ??
                      (entry.contact ? entry.contact.id : "—")}
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-pre-wrap">
                    {entry.reason || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isLoading ? (
            <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
          ) : null}
          {!isLoading && entries.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {t("leaderboards.auditLog.empty")}
            </p>
          ) : null}
        </div>
        {pageCount > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              size="sm"
              variant="outline"
            >
              {t("actions.prev")}
            </Button>
            <span className="text-muted-foreground text-sm">
              {page} / {pageCount}
            </span>
            <Button
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
              size="sm"
              variant="outline"
            >
              {t("actions.next")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
