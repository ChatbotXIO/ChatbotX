"use client"

import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { useEffect } from "react"
import { type UseFormReturn, useWatch } from "react-hook-form"

type CouplingResult = {
  isSuperAdmin: boolean
  contactsEnabled: boolean
}

/**
 * Generic over any form whose values carry a `permissions` field of this
 * shape — the invite/update workspace-member forms and the admin console's
 * create-workspace-for-an-owner form all share it.
 */
export function useWorkspaceMemberPermissionsCoupling<
  TFieldValues extends { permissions: WorkspaceMemberPermissions },
>(form: UseFormReturn<TFieldValues>): CouplingResult {
  // One cast at the boundary instead of ten `as never`s below: the generic
  // public signature stays open to any `TFieldValues` that extends the
  // `permissions` shape, while this internal view restores typed
  // `setValue`/`useWatch` field names.
  const permissionForm = form as unknown as UseFormReturn<{
    permissions: WorkspaceMemberPermissions
  }>
  const { setValue } = permissionForm
  const isSuperAdmin = useWatch({
    control: permissionForm.control,
    name: "permissions.superAdmin",
  })
  const contactsEnabled = useWatch({
    control: permissionForm.control,
    name: "permissions.contacts",
  })

  useEffect(() => {
    if (isSuperAdmin) {
      setValue("permissions.analytics", true)
      setValue("permissions.flows", true)
      setValue("permissions.contacts", true)
      setValue("permissions.onlyAssignedContacts", true)
      setValue("permissions.emailAndPhone", true)
      setValue("permissions.broadcast", true)
      setValue("permissions.ecommerce", true)
    }
  }, [isSuperAdmin, setValue])

  useEffect(() => {
    if (contactsEnabled && !isSuperAdmin) {
      setValue("permissions.onlyAssignedContacts", false)
    }
  }, [contactsEnabled, isSuperAdmin, setValue])

  return { isSuperAdmin, contactsEnabled }
}
