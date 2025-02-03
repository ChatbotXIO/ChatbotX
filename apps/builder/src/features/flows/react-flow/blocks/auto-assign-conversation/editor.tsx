"use client"

import { MultiSelect } from "@/components/ui/multi-select"
import type { RecipientSchema } from "@/features/flows/react-flow/types"
import { T } from "@tolgee/react"
import { MessageCirclePlusIcon } from "lucide-react"
import React, { useMemo } from "react"
import { useFormContext } from "react-hook-form"

const AutoAssignConversationBlockEditor = ({
  parentName,
  recipients,
}: {
  parentName: string
  recipients: RecipientSchema[]
}) => {
  const { watch, register, setValue } = useFormContext()
  const { name } = register(`${parentName}.recipients`)
  const selectedRecipients = watch(name)
  const recipientsList = useMemo(() => {
    return recipients.map((obj) => {
      return {
        value: obj.id,
        label: obj.name,
      }
    })
  }, [recipients])

  return (
    <>
      <div className="flex justify-center items-center gap-2 p-2 font-bold text-center break-all">
        <MessageCirclePlusIcon size={20} className="text-yellow-500" />
        <T keyName="flows.ActionType.AutoAssignConversation" />
      </div>
      <MultiSelect
        options={recipientsList}
        onValueChange={(value) => setValue(name, value)}
        defaultValue={selectedRecipients}
        placeholder="Select options"
        variant="inverted"
        animation={2}
        maxCount={3}
      />
    </>
  )
}

export { AutoAssignConversationBlockEditor }
