"use client"

import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import { FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { callAPI } from "@/lib/swr"
import { PlusCircleIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { mutate } from "swr"
import { CreateCustomFieldDialog } from "./create-custom-field-dialog"
import type { CustomFieldCollection } from "./schemas/get-fields-schema"

interface ICustomFieldSelectProps {
  name: string
  label: string
  isRequired?: boolean
  allowCreate?: boolean
}

export const CustomFieldSelect = ({
  name,
  label = "Select Custom Field",
  isRequired = true,
  allowCreate = false,
}: ICustomFieldSelectProps) => {
  const params = useParams<{ chatbotId: string }>()

  const custormFieldsUrl = `/api/chatbots/${params.chatbotId}/custom-fields?perPage=9999`
  const { data } = callAPI(custormFieldsUrl)
  const customFields = ((data as CustomFieldCollection)?.data ?? []).map(
    (v) => ({
      label: v.name,
      value: v.id,
    }),
  )

  return (
    <FormItem>
      <div className="flex items-center">
        {label && (
          <FormLabel className="flex flex-1 gap-1 items-center">
            {label}
            {!isRequired && (
              <span className="text-xxs self-start font-normal">
                (optional)
              </span>
            )}
          </FormLabel>
        )}
        {allowCreate && (
          <CreateCustomFieldDialog
            chatbotId={params.chatbotId}
            folderId={null}
            triggerButton={
              <Button
                size="xs"
                variant="ghost"
                className="cursor-pointer"
                asChild
              >
                <PlusCircleIcon />
              </Button>
            }
            onSuccess={() => {
              mutate(custormFieldsUrl)
            }}
          />
        )}
      </div>
      <SingleSelect
        name={name}
        placeholder="Please select"
        options={customFields}
      />
    </FormItem>
  )
}
