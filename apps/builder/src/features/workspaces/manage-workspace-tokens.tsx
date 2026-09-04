"use client"

import { CheckboxGroupField } from "@chatbotx.io/ui/components/form/checkbox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
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
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { TokenRevealDialog } from "@/features/integration-api/components/token-reveal-dialog"
import { createWorkspaceTokenAction } from "./actions/create-workspace-token-action"
import { deleteWorkspaceTokenAction } from "./actions/delete-workspace-token-action"
import {
  orderedWorkspaceApiTokenScopes,
  workspaceApiTokenScopeRegistry,
} from "./lib/workspace-token-scopes"
import { createWorkspaceTokenRequest } from "./schema/action"
import type { WorkspaceApiTokenDto } from "./schema/workspace-token-dto"

type ManageWorkspaceTokensProps = {
  workspaceId: string
  tokens: WorkspaceApiTokenDto[]
}

export function ManageWorkspaceTokens({
  workspaceId,
  tokens,
}: ManageWorkspaceTokensProps) {
  const t = useTranslations()
  const formatter = useFormatter()
  const router = useRouter()

  const [createOpen, setCreateOpen] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [deletingToken, setDeletingToken] =
    useState<WorkspaceApiTokenDto | null>(null)

  const boundCreate = useMemo(
    () => createWorkspaceTokenAction.bind(null, workspaceId),
    [workspaceId],
  )
  const boundDelete = useMemo(
    () => deleteWorkspaceTokenAction.bind(null, workspaceId),
    [workspaceId],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    boundCreate,
    zodResolver(createWorkspaceTokenRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          setCreateOpen(false)
          form.reset()
          if (data) {
            setRevealedToken(data.token)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          permission: "full",
          allScopes: true,
          scopes: [],
        },
      },
    },
  )

  const allScopes = form.watch("allScopes")

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    boundDelete,
    {
      onSuccess: () => {
        setDeletingToken(null)
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.developerAccessToken.label"),
          }),
        )
        router.refresh()
      },
      onError: ({ error }) => {
        setDeletingToken(null)
        const message =
          error.serverError ?? error.validationErrors?._errors?.[0]
        toast.error(message ?? t("messages.unknownError"))
        // A validation error here means the row is already gone server-side
        // (e.g. "Token no longer exists") — refresh so the stale row drops.
        router.refresh()
      },
    },
  )

  const permissionLabel = (permission: WorkspaceApiTokenDto["permission"]) =>
    permission === "full"
      ? t("fields.tokenPermission.full")
      : t("fields.tokenPermission.readOnly")

  const permissionOptions = [
    { value: "full", label: permissionLabel("full") },
    { value: "read_only", label: permissionLabel("read_only") },
  ]

  const scopeOptions = orderedWorkspaceApiTokenScopes.map((scope) => ({
    value: scope,
    label: t(workspaceApiTokenScopeRegistry[scope].labelKey),
  }))

  const scopeBadgeLabel = (scopes: WorkspaceApiTokenDto["scopes"]) => {
    if (!scopes) {
      return t("developerAccessToken.allScopes")
    }
    return scopes
      .map((scope) => t(workspaceApiTokenScopeRegistry[scope].labelKey))
      .join(", ")
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        {t("developerAccessToken.description")}
      </p>

      <div className="flex justify-end gap-2">
        <Dialog onOpenChange={setCreateOpen} open={createOpen}>
          <DialogTrigger
            render={
              <Button size="sm">
                <PlusIcon />
                {t("actions.create")}
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("developerAccessToken.createDialogTitle")}
              </DialogTitle>
              <DialogDescription />
            </DialogHeader>
            <Form {...form}>
              <form
                className="flex flex-col gap-4"
                onSubmit={handleSubmitWithAction}
              >
                <InputField
                  label={t("fields.name.label")}
                  name="name"
                  placeholder={t("developerAccessToken.namePlaceholder")}
                  required
                />
                <RadioGroupField
                  label={t("fields.tokenPermission.label")}
                  name="permission"
                  options={permissionOptions}
                  orientation="horizontal"
                  required
                />
                <div className="flex flex-col gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={allScopes}
                      id="allScopes"
                      onCheckedChange={(checked) => {
                        const nextAllScopes = checked === true
                        form.setValue("allScopes", nextAllScopes, {
                          shouldValidate: true,
                        })
                        if (nextAllScopes) {
                          form.setValue("scopes", [], {
                            shouldValidate: true,
                          })
                        }
                      }}
                    />
                    <Label className="font-normal" htmlFor="allScopes">
                      {t("developerAccessToken.allScopes")}
                    </Label>
                  </div>
                  {!allScopes && (
                    <CheckboxGroupField
                      label={t("fields.tokenScopes.label")}
                      name="scopes"
                      options={scopeOptions}
                      required
                    />
                  )}
                </div>
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button type="button" variant="secondary">
                        {t("actions.cancel")}
                      </Button>
                    }
                  />
                  <Button
                    disabled={
                      !form.formState.isValid || form.formState.isSubmitting
                    }
                    type="submit"
                  >
                    {form.formState.isSubmitting ? (
                      <Loader2Icon className="animate-spin" />
                    ) : null}
                    {t("actions.create")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("fields.api.token")}</TableHead>
              <TableHead>{t("fields.tokenPermission.label")}</TableHead>
              <TableHead>{t("fields.tokenScopes.label")}</TableHead>
              <TableHead>{t("fields.createdAt.label")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-muted-foreground text-sm"
                  colSpan={6}
                >
                  {t("developerAccessToken.empty")}
                </TableCell>
              </TableRow>
            )}
            {tokens.map((token) => {
              const isDeletingRow = isDeleting && deletingToken?.id === token.id

              return (
                <TableRow key={token.id}>
                  <TableCell className="flex items-center gap-2 font-medium">
                    {token.name}
                    {token.isDefault && (
                      <Badge variant="outline">
                        {t("developerAccessToken.defaultBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-muted-foreground text-sm">
                      {token.tokenPrefix ?? ""}••••••••
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        token.permission === "full" ? "default" : "secondary"
                      }
                    >
                      {permissionLabel(token.permission)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={token.scopes ? "secondary" : "default"}>
                      {scopeBadgeLabel(token.scopes)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatter.dateTime(new Date(token.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      aria-label={t("actions.delete")}
                      disabled={isDeletingRow}
                      onClick={() => setDeletingToken(token)}
                      size="icon"
                      variant="ghost"
                    >
                      {isDeletingRow ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <TokenRevealDialog
        onOpenChange={(open) => {
          if (!open) {
            setRevealedToken(null)
            router.refresh()
          }
        }}
        token={revealedToken}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeletingToken(null)
          }
        }}
        open={Boolean(deletingToken)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("messages.deleteFeature", {
                feature: t("fields.developerAccessToken.label"),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.deleteConfirmation", {
                feature: deletingToken?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingToken) {
                  executeDelete({ id: deletingToken.id })
                }
              }}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
