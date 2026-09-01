"use client"

import type { WorkspaceApiTokenModel } from "@chatbotx.io/database/types"
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
import { SettingRow } from "@/components/setting-row"
import { TokenRevealDialog } from "@/features/integration-api/components/token-reveal-dialog"
import { createWorkspaceTokenAction } from "./actions/create-workspace-token-action"
import { deleteWorkspaceTokenAction } from "./actions/delete-workspace-token-action"
import { createWorkspaceTokenRequest } from "./schema/action"

type ManageWorkspaceTokensProps = {
  workspaceId: string
  tokens: WorkspaceApiTokenModel[]
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
    useState<WorkspaceApiTokenModel | null>(null)

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
        },
      },
    },
  )

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
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const permissionOptions = [
    { value: "full", label: t("fields.tokenPermission.full") },
    { value: "read_only", label: t("fields.tokenPermission.readOnly") },
  ]

  return (
    <SettingRow
      description={t("developerAccessToken.description")}
      label={t("developerAccessToken.title")}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
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

        {tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("developerAccessToken.empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.name.label")}</TableHead>
                <TableHead>{t("fields.api.token")}</TableHead>
                <TableHead>{t("fields.tokenPermission.label")}</TableHead>
                <TableHead>{t("fields.createdAt.label")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => {
                const isDeletingRow =
                  isDeleting && deletingToken?.id === token.id

                return (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell>
                      <code className="text-muted-foreground text-sm">
                        {token.tokenPrefix
                          ? `${token.tokenPrefix}••••••••`
                          : "••••••••••••"}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          token.permission === "full" ? "default" : "secondary"
                        }
                      >
                        {token.permission === "full"
                          ? t("fields.tokenPermission.full")
                          : t("fields.tokenPermission.readOnly")}
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
        )}

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
    </SettingRow>
  )
}
