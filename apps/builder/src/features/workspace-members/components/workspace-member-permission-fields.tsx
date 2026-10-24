"use client"

import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { isCommunity } from "@/env"
import { useWorkspaceMemberPermissionsCoupling } from "../hooks/use-permissions-coupling"

type WorkspaceMemberPermissionFieldsProps<
  TFieldValues extends { permissions: WorkspaceMemberPermissions },
> = {
  form: UseFormReturn<TFieldValues>
}

/**
 * The `permissions.*` switch block shared by the invite/update workspace-
 * member forms and the admin console's create-workspace-for-an-owner form.
 * Renders inside the caller's own `<Form {...form}>` provider — it only
 * takes `form` to drive `useWorkspaceMemberPermissionsCoupling`'s watches.
 */
export function WorkspaceMemberPermissionFields<
  TFieldValues extends { permissions: WorkspaceMemberPermissions },
>({ form }: WorkspaceMemberPermissionFieldsProps<TFieldValues>) {
  const t = useTranslations()
  const { isSuperAdmin, contactsEnabled } =
    useWorkspaceMemberPermissionsCoupling(form)

  return (
    <>
      <SwitchField
        disabled={isCommunity()}
        formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
        label={t("fields.permissions.superAdmin")}
        name="permissions.superAdmin"
        required
      />
      {!isSuperAdmin && (
        <>
          <SwitchField
            formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
            label={t("fields.permissions.analytics")}
            name="permissions.analytics"
            required
          />
          <SwitchField
            formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
            label={t("fields.permissions.flows")}
            name="permissions.flows"
            required
          />
          <SwitchField
            formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
            label={t("fields.permissions.contacts")}
            name="permissions.contacts"
            required
          />
          {!contactsEnabled && (
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.permissions.onlyAssignedContacts")}
              name="permissions.onlyAssignedContacts"
              required
            />
          )}
          <SwitchField
            formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
            label={t("fields.permissions.emailAndPhone")}
            name="permissions.emailAndPhone"
            required
          />
          <SwitchField
            formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
            label={t("fields.permissions.broadcast")}
            name="permissions.broadcast"
            required
          />
          <SwitchField
            formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
            label={t("fields.permissions.ecommerce")}
            name="permissions.ecommerce"
            required
          />
        </>
      )}
    </>
  )
}
