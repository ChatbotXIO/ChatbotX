"use client"

import type {
  TemplateBindableInbox,
  TemplateRequiredInbox,
} from "@chatbotx.io/business"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
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
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { installTemplateAction } from "../actions/install-template.action"
import { toastActionError } from "../lib/action-error-toast"
import { useIdempotencyKey } from "../lib/use-idempotency-key"
import { useOptionalLabel } from "../lib/use-optional-label"
import { InstallCollisionSummary } from "./install-collision-summary"

type WorkspaceOption = {
  id: string
  name: string
  logoUrl: string | null
  crossTenant: boolean
}

type WorkspacePickerProps = {
  shareToken: string
  workspaces: WorkspaceOption[]
  requiredInboxes: TemplateRequiredInbox[]
  inboxOptions: Record<string, TemplateBindableInbox[]>
  installedCopies: Record<string, { id: string; autoUpdate: boolean }>
}

const NO_INBOX = "none"

/**
 * One row per workspace, each with its Install; the workspace's own choices
 * (inboxes, publisher access, what the install will do) open in a popup, since
 * the publisher access has to be disclosed before installing.
 *
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
  const tRoot = useTranslations()
  const router = useRouter()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<
    string | undefined
  >()

  // `{ templateInboxId: chosenInboxId }`; an inbox left out installs inactive.
  const [bindings, setBindings] = useState<Record<string, string>>({})
  const [touchedAutoUpdate, setTouchedAutoUpdate] = useState<
    boolean | undefined
  >()
  // Set when the chosen workspace already has this template installed.
  const installedCopy = installedCopies[selectedWorkspaceId ?? ""]
  const installedId = installedCopy?.id ?? null
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  )
  // A same-tenant copy grants its publisher access; the server refuses it
  // across tenants, so a cross-tenant copy never sends it as granted.
  const allowPublisherAccess = selectedWorkspace?.crossTenant !== true
  const autoUpdate = touchedAutoUpdate ?? installedCopy?.autoUpdate ?? false

  const channelLabel = useOptionalLabel("templates.channels")

  const chooseWorkspace = (workspaceId: string | undefined) => {
    setSelectedWorkspaceId(workspaceId)
    // The choices made in the popup belong to the workspace they were made for.
    setTouchedAutoUpdate(undefined)
    setBindings({})
  }

  // One key per distinct request: resubmitting the same inputs replays the
  // same install or sync, while changing the workspace, an inbox or a choice
  // (or switching button) is a new request the server must not reject as reused.
  const idempotency = useIdempotencyKey()
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
      onError: ({ error }) =>
        toastActionError(error, tRoot("messages.unknownError")),
    },
  )

  const execute = (
    request: Omit<Parameters<typeof executeAction>[0], "idempotencyKey">,
  ) =>
    executeAction({
      ...request,
      idempotencyKey: idempotency.keyFor(selectedWorkspaceId, request),
    })

  // The inboxes of the chosen workspace that can stand in for each required one.
  const inboxChoices = useMemo(
    () =>
      requiredInboxes.map((required) => {
        const candidates = (
          inboxOptions[selectedWorkspaceId ?? ""] ?? []
        ).filter((inbox) => inbox.channel === required.channelType)
        return {
          required,
          candidates,
          inboxItems: [
            { label: t("noInbox"), value: NO_INBOX },
            ...candidates.map((inbox) => ({
              label: inbox.name,
              value: inbox.id,
            })),
          ],
        }
      }),
    [requiredInboxes, inboxOptions, selectedWorkspaceId, t],
  )

  if (workspaces.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("noEligibleWorkspaces")}
      </p>
    )
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <h2 className="text-center font-semibold text-2xl">
        {t("selectWorkspace")}
      </h2>
      <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {workspaces.map((workspace) => (
          <li className="flex items-center gap-4 p-3" key={workspace.id}>
            <Avatar className="size-12">
              <AvatarImage alt={workspace.name} src={workspace.logoUrl ?? ""} />
              <AvatarFallback className="font-medium">
                {workspace.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm">
              {workspace.name}
            </span>
            <Button onClick={() => chooseWorkspace(workspace.id)}>
              {t("install")}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            chooseWorkspace(undefined)
          }
        }}
        open={Boolean(selectedWorkspace)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="truncate">
              {selectedWorkspace?.name}
            </DialogTitle>
          </DialogHeader>
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
              <p className="text-muted-foreground text-sm">
                {t("inboxesHint")}
              </p>
              {inboxChoices.map(({ required, candidates, inboxItems }) => (
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
                        const { [required.sourceId]: _dropped, ...rest } =
                          current
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
              ))}
            </fieldset>
          )}
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
          {installedId ? null : (
            <DialogFooter>
              <Button
                disabled={isPending}
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
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
