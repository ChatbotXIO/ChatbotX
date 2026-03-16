"use client"

import {
  SelectField,
  type SelectFieldProps,
} from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { FieldValues } from "react-hook-form"

type SpreadsheetSelectProps = SelectFieldProps<FieldValues> & {
  allowCreate?: boolean
}

export const SpreadsheetSelect = ({
  allowCreate = false,
  ...props
}: SpreadsheetSelectProps) => {
  const params = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const url = `/api/chatbots/${params.chatbotId}/spreadsheets?perPage=9999`

  return (
    <SelectField
      {...props}
      fetchOptionsUrl={url}
      label={t("fields.spreadsheets.label")}
      required
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
