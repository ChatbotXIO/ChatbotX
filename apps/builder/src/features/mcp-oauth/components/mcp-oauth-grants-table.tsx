"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { revokeMcpOAuthGrantAction } from "../actions/revoke-mcp-oauth-grant.action"
import type { McpOAuthGrantDto } from "../schema/grant-dto"

type McpOAuthGrantsTableProps = {
  grants: McpOAuthGrantDto[]
  workspaceId: string
}

export const McpOAuthGrantsTable = ({
  grants,
  workspaceId,
}: McpOAuthGrantsTableProps) => {
  const [grantToRevoke, setGrantToRevoke] = useState<McpOAuthGrantDto | null>(
    null,
  )
  const formatter = useFormatter()
  const router = useRouter()
  const t = useTranslations("chatbotxMcp")
  const common = useTranslations()
  const { execute, isPending } = useAction(
    revokeMcpOAuthGrantAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        setGrantToRevoke(null)
        const message =
          error.serverError ?? error.validationErrors?._errors?.[0]
        toast.error(message ?? common("messages.unknownError"))
        router.refresh()
      },
      onSuccess: () => {
        toast.success(t("grants.revokedSuccess"))
        setGrantToRevoke(null)
        router.refresh()
      },
    },
  )

  const formatDate = (value: string) =>
    formatter.dateTime(new Date(value), {
      dateStyle: "medium",
      timeStyle: "short",
    })

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">{t("grants.title")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("grants.description")}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("grants.client")}</TableHead>
              <TableHead>{t("grants.scopes")}</TableHead>
              <TableHead>{t("grants.firstAuthorizedAt")}</TableHead>
              <TableHead>{t("grants.lastRefreshedAt")}</TableHead>
              <TableHead>{t("grants.expiresAt")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-muted-foreground text-sm"
                  colSpan={6}
                >
                  {t("grants.empty")}
                </TableCell>
              </TableRow>
            ) : (
              grants.map((grant) => (
                <TableRow key={grant.clientId}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {grant.clientIcon ? (
                        <Image
                          alt=""
                          className="size-5 rounded-sm"
                          height={20}
                          src={grant.clientIcon}
                          width={20}
                        />
                      ) : null}
                      {grant.clientName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {grant.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(grant.firstAuthorizedAt)}</TableCell>
                  <TableCell>{formatDate(grant.lastRefreshedAt)}</TableCell>
                  <TableCell>
                    {formatDate(grant.accessTokenExpiresAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      aria-label={t("grants.revoke")}
                      disabled={
                        isPending && grantToRevoke?.clientId === grant.clientId
                      }
                      onClick={() => setGrantToRevoke(grant)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {isPending &&
                      grantToRevoke?.clientId === grant.clientId ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-sm">{t("grants.description")}</p>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setGrantToRevoke(null)
          }
        }}
        open={Boolean(grantToRevoke)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("grants.revokeConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("grants.revokeConfirmDescription", {
                clientName: grantToRevoke?.clientName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => {
                if (grantToRevoke) {
                  execute({ clientId: grantToRevoke.clientId })
                }
              }}
            >
              {t("grants.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
