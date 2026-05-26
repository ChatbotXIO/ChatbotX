"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { createOrganizationUserAction } from "../actions/create-organization-user.action"
import { updateOrganizationUserAction } from "../actions/update-organization-user.action"
import type { OrganizationMemberDetail } from "../queries/get-member-detail"
import {
  type EditOrganizationUserSchema,
  editOrganizationUserSchema,
  type UpsertOrganizationUserSchema,
  upsertOrganizationUserSchema,
} from "../schema/upsert"

type WorkspaceOption = { id: string; name: string }

type UserFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceOptions: WorkspaceOption[]
  /** When set, dialog is in edit mode. */
  initial?: OrganizationMemberDetail | null
  onSuccess?: () => void
}

export function UserFormDialog({
  open,
  onOpenChange,
  workspaceOptions,
  initial,
  onSuccess,
}: UserFormDialogProps) {
  const t = useTranslations()
  const isEdit = Boolean(initial)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("organizationUsers.editTitle")
              : t("organizationUsers.addTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("organizationUsers.editDescription")
              : t("organizationUsers.addDescription")}
          </DialogDescription>
        </DialogHeader>
        {isEdit && initial ? (
          <EditForm
            initial={initial}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
            workspaceOptions={workspaceOptions}
          />
        ) : (
          <CreateForm
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
            workspaceOptions={workspaceOptions}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const orgRoleOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "owner", label: t("organizationUsers.orgRoles.owner") },
  { value: "manager", label: t("organizationUsers.orgRoles.manager") },
  { value: "agent", label: t("organizationUsers.orgRoles.agent") },
]

const wsRoleOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "owner", label: t("organizationUsers.wsRoles.owner") },
  { value: "manager", label: t("organizationUsers.wsRoles.manager") },
  { value: "agent", label: t("organizationUsers.wsRoles.agent") },
]

function CreateForm({
  workspaceOptions,
  onClose,
  onSuccess,
}: {
  workspaceOptions: WorkspaceOption[]
  onClose: () => void
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const tActions = useTranslations("actions")

  const form = useForm<UpsertOrganizationUserSchema>({
    resolver: zodResolver(upsertOrganizationUserSchema) as never,
    mode: "onChange",
    defaultValues: {
      email: "",
      name: "",
      organizationRole: "agent",
      workspaceAssignments: workspaceOptions[0]
        ? [{ workspaceId: workspaceOptions[0].id, role: "agent" }]
        : [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "workspaceAssignments",
  })

  const { execute, isExecuting } = useAction(createOrganizationUserAction, {
    onSuccess: () => {
      toast.success(t("organizationUsers.created"))
      onSuccess?.()
      onClose()
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  const onSubmit = form.handleSubmit((values) => execute(values))

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label={t("fields.email.label")}
            name="email"
            placeholder={t("fields.email.placeholder")}
            required
            type="email"
          />
          <InputField
            label={t("fields.name.label")}
            name="name"
            placeholder={t("fields.name.placeholder")}
          />
        </div>

        <SelectField
          label={t("organizationUsers.orgAccess")}
          name="organizationRole"
          options={orgRoleOptions(t)}
          required
        />

        <WorkspaceAssignmentsField
          fields={fields}
          onAppend={() =>
            append({
              workspaceId: workspaceOptions[0]?.id ?? "",
              role: "agent",
            })
          }
          onRemove={remove}
          workspaceOptions={workspaceOptions}
        />

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            {tActions("cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || isExecuting}
            type="submit"
          >
            {isExecuting && <Loader2Icon className="size-4 animate-spin" />}
            {t("organizationUsers.addSubmit")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

function EditForm({
  initial,
  workspaceOptions,
  onClose,
  onSuccess,
}: {
  initial: OrganizationMemberDetail
  workspaceOptions: WorkspaceOption[]
  onClose: () => void
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const tActions = useTranslations("actions")

  const form = useForm<EditOrganizationUserSchema>({
    resolver: zodResolver(editOrganizationUserSchema) as never,
    mode: "onChange",
    defaultValues: {
      userId: initial.userId,
      organizationRole: initial.organizationRole as never,
      workspaceAssignments: initial.workspaceAssignments.map((a) => ({
        workspaceId: a.workspaceId,
        role: a.role as never,
      })),
    },
  })

  useEffect(() => {
    form.reset({
      userId: initial.userId,
      organizationRole: initial.organizationRole as never,
      workspaceAssignments: initial.workspaceAssignments.map((a) => ({
        workspaceId: a.workspaceId,
        role: a.role as never,
      })),
    })
  }, [initial, form])

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "workspaceAssignments",
  })

  const { execute, isExecuting } = useAction(updateOrganizationUserAction, {
    onSuccess: () => {
      toast.success(t("organizationUsers.updated"))
      onSuccess?.()
      onClose()
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  const onSubmit = form.handleSubmit((values) => execute(values))

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="rounded-md border border-white/[0.08] bg-app-surface px-3 py-2">
          <div className="font-semibold text-sm">{initial.name}</div>
          <div className="text-text-secondary text-xs">{initial.email}</div>
        </div>

        <SelectField
          label={t("organizationUsers.orgAccess")}
          name="organizationRole"
          options={orgRoleOptions(t)}
          required
        />

        <WorkspaceAssignmentsField
          fields={fields}
          onAppend={() =>
            append({
              workspaceId: workspaceOptions[0]?.id ?? "",
              role: "agent",
            })
          }
          onRemove={remove}
          workspaceOptions={workspaceOptions}
        />

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            {tActions("cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || isExecuting}
            type="submit"
          >
            {isExecuting && <Loader2Icon className="size-4 animate-spin" />}
            {t("organizationUsers.editSubmit")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

function WorkspaceAssignmentsField({
  fields,
  onAppend,
  onRemove,
  workspaceOptions,
}: {
  fields: Array<{ id: string }>
  onAppend: () => void
  onRemove: (idx: number) => void
  workspaceOptions: WorkspaceOption[]
}) {
  const t = useTranslations()

  return (
    <div className="space-y-2">
      <Label>{t("organizationUsers.workspaceAccess")}</Label>
      <div className="space-y-2">
        {fields.length === 0 ? (
          <p className="text-text-secondary text-xs">
            {t("organizationUsers.noWorkspaces")}
          </p>
        ) : null}
        {fields.map((f, idx) => (
          <div className="grid grid-cols-[1fr_180px_36px] gap-2" key={f.id}>
            <SelectField
              name={`workspaceAssignments.${idx}.workspaceId`}
              options={workspaceOptions.map((o) => ({
                value: o.id,
                label: o.name,
              }))}
              placeholder={t("organizationUsers.selectWorkspace")}
            />
            <SelectField
              name={`workspaceAssignments.${idx}.role`}
              options={wsRoleOptions(t)}
              placeholder={t("organizationUsers.selectRole")}
            />
            <Button
              onClick={() => onRemove(idx)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button onClick={onAppend} size="sm" type="button" variant="ghost">
        <PlusIcon className="size-4" />
        {t("organizationUsers.addWorkspace")}
      </Button>
    </div>
  )
}
