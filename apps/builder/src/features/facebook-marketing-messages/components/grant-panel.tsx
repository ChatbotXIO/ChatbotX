"use client"

import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { connectMarketingMessagesAction } from "../actions/connect.action"

/**
 * `missing` shows the plain prompt; `expired` adds the revoked/expired warning
 * above it while the campaign list stays rendered (read-only) underneath.
 */
export function GrantPanel({
  workspaceId,
  state,
}: {
  workspaceId: string
  state: "missing" | "expired"
}) {
  const t = useTranslations()
  // `bindArgsSchemas` means the action MUST be bound with the workspace id
  // before it is handed to useAction, and executed with no arguments.
  const { execute, isPending } = useAction(
    connectMarketingMessagesAction.bind(null, workspaceId),
    {
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("facebookMarketingMessages.grantTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state === "expired" && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("facebookMarketingMessages.expiredWarning")}
            </AlertDescription>
          </Alert>
        )}
        <p className="text-muted-foreground text-sm">
          {t("facebookMarketingMessages.grantDescription")}
        </p>
        <div>
          <Button disabled={isPending} onClick={() => execute()} type="button">
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {t("facebookMarketingMessages.grantAction")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
