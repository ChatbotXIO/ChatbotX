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
  const { setValue } = form
  const isSuperAdmin = useWatch({
    control: form.control,
    name: "permissions.superAdmin" as never,
  }) as unknown as boolean
  const contactsEnabled = useWatch({
    control: form.control,
    name: "permissions.contacts" as never,
  }) as unknown as boolean

  useEffect(() => {
    if (isSuperAdmin) {
      setValue("permissions.analytics" as never, true as never)
      setValue("permissions.flows" as never, true as never)
      setValue("permissions.contacts" as never, true as never)
      setValue("permissions.onlyAssignedContacts" as never, true as never)
      setValue("permissions.emailAndPhone" as never, true as never)
      setValue("permissions.broadcast" as never, true as never)
      setValue("permissions.ecommerce" as never, true as never)
    }
  }, [isSuperAdmin, setValue])

  useEffect(() => {
    if (contactsEnabled && !isSuperAdmin) {
      setValue("permissions.onlyAssignedContacts" as never, false as never)
    }
  }, [contactsEnabled, isSuperAdmin, setValue])

  return { isSuperAdmin, contactsEnabled }
}
