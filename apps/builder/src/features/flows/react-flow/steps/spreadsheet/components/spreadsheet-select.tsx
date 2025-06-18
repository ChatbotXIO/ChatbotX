"use client"

import { useParams } from "next/navigation"
import type { ReactNode } from "react"
import { SelectField } from "@/components/form/select-field"
import type { SpreadsheetCollection } from "@/features/spreadsheets/schemas"
import { callAPI } from "@/lib/swr"

type SpreadsheetSelectProps = {
  name: string
  label?: ReactNode | string
  isRequired?: boolean
  allowCreate?: boolean
  onChange?: () => void
}

export const SpreadsheetSelect = ({
  name,
  // label = "Select Spreadsheet",
  isRequired = true,
  // allowCreate = true,
}: SpreadsheetSelectProps) => {
  const params = useParams<{ chatbotId: string }>()

  const url = `/api/chatbots/${params.chatbotId}/spreadsheets?perPage=9999`
  const { data } = callAPI<SpreadsheetCollection>(url)

  const spreadsheetOptions = (data?.data ?? []).map((v) => ({
    label: v.name,
    value: v.id,
  }))

  return (
    <SelectField
      isRequired={isRequired}
      label="Spreadsheet"
      name={name}
      options={spreadsheetOptions}
      placeholder="Please select"
    />

    // <FormItem className="w-full">
    //   {label && label !== "" && (
    //     <div className="flex items-center">
    //       <FormLabel className="flex flex-1 gap-1 items-center">
    //         {label}
    //         {!isRequired && (
    //           <span className="text-xxs self-start font-normal">
    //             (optional)
    //           </span>
    //         )}
    //       </FormLabel>
    //       {allowCreate && (
    //         <CreateSpreadsheetDialog
    //           chatbotId={params.chatbotId}
    //           triggerButton={
    //             <Button
    //               size="sm"
    //               variant="destructive"
    //               className="cursor-pointer"
    //               asChild
    //             >
    //               <PlusIcon size={20} className="text-pink-300" />
    //             </Button>
    //           }
    //           onSuccess={() => {
    //             mutate(url)
    //           }}
    //         />
    //       )}
    //     </div>
    //   )}

    // </FormItem>
  )
}
