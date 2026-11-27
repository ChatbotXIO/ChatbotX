"use client"

import type { TemplateInstallerIssues } from "@chatbotx.io/business"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { getInstallerIssuesAction } from "../actions/get-installer-issues.action"
import { useErrorLabel } from "../lib/error-label"
import { TemplateInstallationWarnings } from "./template-installation-warnings"

export type IssuesInstaller = { publisherRef: string; name: string }

type LoadState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "loaded"; issues: TemplateInstallerIssues }

/** What went wrong in one installer's copy, for the publisher to fix in the template. */
export function InstallerIssuesDialog({
  workspaceId,
  templateId,
  installer,
  onOpenChange,
}: {
  workspaceId: string
  templateId: string
  installer: IssuesInstaller | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const errorLabel = useErrorLabel("templates.installs.errors")
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const publisherRef = installer?.publisherRef

  useEffect(() => {
    if (!publisherRef) {
      return
    }
    let isCurrent = true
    setState({ kind: "loading" })
    getInstallerIssuesAction
      .bind(
        null,
        workspaceId,
        templateId,
      )({ publisherRef })
      .then((result) => {
        if (isCurrent) {
          setState(
            result?.data
              ? { kind: "loaded", issues: result.data }
              : { kind: "failed" },
          )
        }
      })
      .catch(() => {
        if (isCurrent) {
          setState({ kind: "failed" })
        }
      })
    return () => {
      isCurrent = false
    }
  }, [workspaceId, templateId, publisherRef])

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(installer)}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{installer?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          {state.kind === "loading" ? (
            <Loader2Icon className="mx-auto my-6 size-4 animate-spin text-muted-foreground" />
          ) : null}
          {state.kind === "failed" ? (
            <p
              className="py-6 text-center text-destructive text-sm"
              role="alert"
            >
              {t("templates.installers.loadError")}
            </p>
          ) : null}
          {state.kind === "loaded" ? (
            <IssuesBody errorLabel={errorLabel} issues={state.issues} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IssuesBody({
  issues,
  errorLabel,
}: {
  issues: TemplateInstallerIssues
  errorLabel: (code: string | null | undefined) => string
}) {
  const t = useTranslations()
  const hasFailed = issues.status === "failed"
  if (!hasFailed && issues.warningGroups.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        {t("templates.installers.noIssues")}
      </p>
    )
  }
  return (
    <>
      {hasFailed ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
          role="alert"
        >
          {errorLabel(issues.errorCode)}
        </p>
      ) : null}
      <TemplateInstallationWarnings groups={issues.warningGroups} />
    </>
  )
}
