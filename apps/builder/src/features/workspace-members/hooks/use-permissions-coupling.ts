"use client"

import { useEffect } from "react"
import { type UseFormReturn, useWatch } from "react-hook-form"
import type {
  InviteWorkspaceMemberRequest,
  UpdateWorkspaceMemberRequest,
} from "../schema/mutation"

type CouplingResult = {
  isSuperAdmin: boolean
  contactsEnabled: boolean
}

export function useWorkspaceMemberPermissionsCoupling(
  form:
    | UseFormReturn<InviteWorkspaceMemberRequest>
    | UseFormReturn<UpdateWorkspaceMemberRequest>,
): CouplingResult {
  const permissionForm = form as UseFormReturn<InviteWorkspaceMemberRequest>
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
