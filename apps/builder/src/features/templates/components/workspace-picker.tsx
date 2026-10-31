"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { installTemplateAction } from "../actions/install-template.action"
import { InstallCollisionSummary } from "./install-collision-summary"

type WorkspaceOption = {
  id: string
  name: string
}

type RequiredInbox = { sourceId: string; channelType: string; name: string }
type InboxOption = { id: string; name: string; channel: string }

type WorkspacePickerProps = {
  shareToken: string
  workspaces: WorkspaceOption[]
  /** Inboxes the template was built around; the installer may bind their own. */
  requiredInboxes: RequiredInbox[]
  /** Connected inboxes per workspace id, on the template's channels. */
  inboxOptions: Record<string, InboxOption[]>
  /** Workspaces that already hold this template: workspace id -> the installed copy. */
  installedCopies: Record<
    string,
    { id: string; granted: boolean; autoUpdate: boolean }
  >
}

const NO_INBOX = "none"

/**
 * The install action returns only `{installationId}` — it never means the
 * install already finished — so on success this only toasts "started" and
 * routes to the installs status page, never "installed".
 */
export function WorkspacePicker({
  shareToken,
  workspaces,
  requiredInboxes,
  inboxOptions,
  installedCopies,
}: WorkspacePickerProps) {
  const t = useTranslations("templatesPublicPage")
  const router = useRouter()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    workspaces[0]?.id,
  )
  const options = useMemo(
    () =>
      workspaces.map((workspace) => ({
        label: workspace.name,
        value: workspace.id,
      })),
    [workspaces],
  )

  // `{ templateInboxId: chosenInboxId }`; an inbox left out installs inactive.
  const [bindings, setBindings] = useState<Record<string, string>>({})
  // The checkbox shows what will be sent and always sends it, so a reinstall
  // never applies an earlier choice the installer can not see here. Disclosed
  // before installing; on for a first install, and changeable later on the
  // install page.
  const [touchedPublisherAccess, setTouchedPublisherAccess] = useState<
    boolean | undefined
  >()
  const [touchedAutoUpdate, setTouchedAutoUpdate] = useState<
    boolean | undefined
  >()
  // Set when the chosen workspace already has this template installed.
  const installedCopy = installedCopies[selectedWorkspaceId ?? ""]
  const installedId = installedCopy?.id ?? null
  const allowPublisherAccess =
    touchedPublisherAccess ?? installedCopy?.granted ?? true
  const autoUpdate = touchedAutoUpdate ?? installedCopy?.autoUpdate ?? false

  const tChannels = useTranslations("templates.channels")
  const channelLabel = (channel: string) =>
    tChannels.has(channel) ? tChannels(channel) : channel

  // One key per distinct request: resubmitting the same inputs replays the
  // same install or sync, while changing the workspace, an inbox or a choice
  // (or switching button) is a new request the server must not reject as reused.
  const lastRequest = useRef<{ fingerprint: string; key: string } | null>(null)
  const idempotencyKeyFor = (request: Record<string, unknown>) => {
    const fingerprint = JSON.stringify([selectedWorkspaceId, request])
    if (lastRequest.current?.fingerprint !== fingerprint) {
      lastRequest.current = { fingerprint, key: crypto.randomUUID() }
    }
    return lastRequest.current.key
  }
  const { execute: executeAction, isPending } = useAction(
    installTemplateAction.bind(null, selectedWorkspaceId ?? ""),
    {
      onSuccess: ({ data }) => {
        // Updating an installed copy lands on that copy; a fresh install on the list.
        toast.success(data?.syncId ? t("updateStarted") : t("installStarted"))
        if (selectedWorkspaceId) {
          router.push(
            data?.syncId && data.installationId
              ? `/space/${selectedWorkspaceId}/templates/installs/${data.installationId}`
              : `/space/${selectedWorkspaceId}/templates/installs`,
          )
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const execute = (
    request: Omit<Parameters<typeof executeAction>[0], "idempotencyKey">,
  ) => executeAction({ ...request, idempotencyKey: idempotencyKeyFor(request) })

  if (workspaces.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("noEligibleWorkspaces")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          items={options}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setSelectedWorkspaceId(value)
              // Their consent and auto-update choices belong to the workspace they were made for.
              setTouchedPublisherAccess(undefined)
              setTouchedAutoUpdate(undefined)
              // Inbox choices belong to the workspace they were made in.
              setBindings({})
            }
          }}
          value={selectedWorkspaceId}
        >
          <SelectTrigger className="sm:w-64">
            <SelectValue placeholder={t("selectWorkspace")} />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {installedId ? null : (
          <Button
            disabled={!selectedWorkspaceId || isPending}
            onClick={() =>
              execute({
                shareToken,
                inboxBindings: bindings,
                acceptPublisherUninstall: allowPublisherAccess,
              })
            }
          >
            {isPending && <Loader2 className="animate-spin" />}
            {t("install")}
          </Button>
        )}
      </div>
      {selectedWorkspaceId && (
        <InstallCollisionSummary
          inboxBindings={bindings}
          shareToken={shareToken}
          workspaceId={selectedWorkspaceId}
        />
      )}
      {requiredInboxes.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-md border p-3">
          <legend className="px-1 font-medium text-sm">
            {t("inboxesTitle")}
          </legend>
          <p className="text-muted-foreground text-sm">{t("inboxesHint")}</p>
          {requiredInboxes.map((required) => {
            const candidates = (
              inboxOptions[selectedWorkspaceId ?? ""] ?? []
            ).filter((inbox) => inbox.channel === required.channelType)
            const inboxItems = [
              { label: t("noInbox"), value: NO_INBOX },
              ...candidates.map((inbox) => ({
                label: inbox.name,
                value: inbox.id,
              })),
            ]
            return (
              <div
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                key={`${selectedWorkspaceId}:${required.sourceId}`}
              >
                <span className="text-sm">
                  {required.name}{" "}
                  <span className="text-muted-foreground">
                    ({channelLabel(required.channelType)})
                  </span>
                </span>
                <Select
                  disabled={candidates.length === 0}
                  items={inboxItems}
                  onValueChange={(value) =>
                    setBindings((current) => {
                      const { [required.sourceId]: _dropped, ...rest } = current
                      return typeof value === "string" && value !== NO_INBOX
                        ? { ...rest, [required.sourceId]: value }
                        : rest
                    })
                  }
                  value={
                    candidates.length === 0
                      ? null
                      : (bindings[required.sourceId] ?? NO_INBOX)
                  }
                >
                  <SelectTrigger className="sm:w-64">
                    <SelectValue placeholder={t("noInboxAvailable")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INBOX}>{t("noInbox")}</SelectItem>
                    {candidates.map((inbox) => (
                      <SelectItem key={inbox.id} value={inbox.id}>
                        {inbox.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </fieldset>
      )}
      <div className="flex items-start gap-2 rounded-md border p-3">
        <Checkbox
          checked={allowPublisherAccess}
          id="allow-publisher-access"
          onCheckedChange={(checked) =>
            setTouchedPublisherAccess(Boolean(checked))
          }
        />
        <div className="flex flex-col gap-0.5">
          <Label
            className="cursor-pointer font-normal text-sm"
            htmlFor="allow-publisher-access"
          >
            {t("publisherAccessLabel")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t("publisherAccessHint")}
          </p>
        </div>
      </div>
      {installedId && (
        <div
          className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 text-sm"
          role="status"
        >
          {/* Stacked: three actions beside the text squeezed it into a sliver. */}
          <span className="flex flex-col gap-2">
            <span>{t("alreadyInstalled")}</span>
            <span className="flex items-center gap-2">
              <Checkbox
                checked={autoUpdate}
                id="update-automatically"
                onCheckedChange={(checked) =>
                  setTouchedAutoUpdate(Boolean(checked))
                }
              />
              <Label
                className="cursor-pointer font-normal"
                htmlFor="update-automatically"
              >
                {t("autoUpdateLabel")}
              </Label>
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/space/${selectedWorkspaceId}/templates/installs/${installedId}`}
                />
              }
              size="sm"
              variant="outline"
            >
              {t("viewInstall")}
            </Button>
            <Button
              disabled={isPending}
              onClick={() =>
                execute({
                  shareToken,
                  inboxBindings: bindings,
                  acceptPublisherUninstall: allowPublisherAccess,
                  // Their current choice, so updating never switches it back on.
                  autoUpdate,
                })
              }
              size="sm"
            >
              {isPending && <Loader2 className="animate-spin" />}
              {t("updateExisting")}
            </Button>
            <Button
              disabled={isPending}
              onClick={() =>
                execute({
                  shareToken,
                  allowDuplicate: true,
                  inboxBindings: bindings,
                  acceptPublisherUninstall: allowPublisherAccess,
                })
              }
              size="sm"
              variant="outline"
            >
              {t("installAnotherCopy")}
            </Button>
          </span>
        </div>
      )}
    </div>
  )
}
