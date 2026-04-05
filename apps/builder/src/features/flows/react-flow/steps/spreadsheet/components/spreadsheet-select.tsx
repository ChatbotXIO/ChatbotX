"use client"

import {
  SelectField,
  type SelectFieldProps,
} from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import type { FieldValues } from "react-hook-form"
import { useWorkspaceId } from "@/hooks/routing"

type SpreadsheetSelectProps = SelectFieldProps<FieldValues> & {
  allowCreate?: boolean
}

export const SpreadsheetSelect = ({
  allowCreate = false,
  ...props
}: SpreadsheetSelectProps) => {
  const workspaceId = useWorkspaceId()
  const t = useTranslations()

  const url = `/api/workspaces/${workspaceId}/spreadsheets?perPage=9999`

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
    //           workspaceId={params.workspaceId}
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
