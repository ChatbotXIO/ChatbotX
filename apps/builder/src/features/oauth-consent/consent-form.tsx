"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { submitOAuthConsentAction } from "./actions/consent.action"

type ConsentWorkspace = { id: string; name: string }

type OAuthConsentFormProps = {
  clientId: string
  clientName: string
  consentCode: string
  scopes: string[]
  userEmail: string
  workspaces: ConsentWorkspace[]
}

export const OAuthConsentForm = ({
  clientId,
  clientName,
  consentCode,
  scopes,
  userEmail,
  workspaces,
}: OAuthConsentFormProps) => {
  const t = useTranslations("oauthConsent")
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(
    workspaces.length === 1 ? workspaces[0]?.id : undefined,
  )
  const { execute, isPending } = useAction(submitOAuthConsentAction, {
    onSuccess: ({ data }) => {
      if (!data?.redirectURI) {
        toast.error(t("failed"))
        return
      }
      window.location.assign(data.redirectURI)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t("failed"))
    },
  })

  const handleDeny = () => {
    execute({ accept: false, clientId, consentCode })
  }

  const handleApprove = () => {
    if (!workspaceId) {
      return
    }
    execute({ accept: true, clientId, consentCode, workspaceId })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("title", { clientName })}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("signedInAs")}</dt>
              <dd className="font-medium">{userEmail}</dd>
            </div>
          </dl>
          <WorkspacePicker
            clientName={clientName}
            onChange={setWorkspaceId}
            value={workspaceId}
            workspaces={workspaces}
          />
          <section aria-labelledby="oauth-permissions-title">
            <h2 className="font-medium" id="oauth-permissions-title">
              {t("permissionsTitle")}
            </h2>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground text-sm">
              {scopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </section>
          <div className="flex justify-end gap-3">
            <Button
              disabled={isPending}
              onClick={handleDeny}
              type="button"
              variant="outline"
            >
              {t("deny")}
            </Button>
            <Button
              disabled={isPending || !workspaceId}
              onClick={handleApprove}
              type="button"
            >
              {t("approve")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

type WorkspacePickerProps = {
  clientName: string
  onChange: (workspaceId: string) => void
  value: string | undefined
  workspaces: ConsentWorkspace[]
}

const WorkspacePicker = ({
  clientName,
  onChange,
  value,
  workspaces,
}: WorkspacePickerProps) => {
  const t = useTranslations("oauthConsent")

  if (workspaces.length === 0) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t("noWorkspaces")}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="oauth-consent-workspace">{t("workspaceLabel")}</Label>
      <Select
        items={workspaces.map((workspace) => ({
          label: workspace.name,
          value: workspace.id,
        }))}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(next)
          }
        }}
        value={value ?? null}
      >
        <SelectTrigger className="w-full" id="oauth-consent-workspace">
          <SelectValue placeholder={t("workspacePlaceholder")} />
        </SelectTrigger>
        <SelectContent className="max-h-64 min-w-(--anchor-width)">
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">
        {t("workspaceHint", { clientName })}
      </p>
    </div>
  )
}
