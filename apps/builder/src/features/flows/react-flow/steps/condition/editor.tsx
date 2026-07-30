"use client"

import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { conditionCaseDefaultFn } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import { ContactFilter } from "@/features/contact-filter"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { useWorkspaceId } from "@/hooks/routing"

const CONDITION_EXCLUDED_FILTER_FIELDS: ContactFilterField[] = []

type ConditionStepEditorProps = {
  parentName: string
}

const ConditionStepEditor = ({ parentName }: ConditionStepEditorProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    keyName: "fieldArrayId",
    name: `${parentName}.cases`,
  })

  return (
    <SequenceStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <Card className="p-0" key={field.fieldArrayId}>
            <CardContent className="flex flex-col gap-3 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-muted-foreground text-sm">
                  {t("flows.condition.caseTitle", { index: index + 1 })}
                </div>
                <Button
                  className="size-8 shrink-0"
                  disabled={fields.length <= 1}
                  onClick={() => remove(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <ContactFilter
                enableVariables={true}
                excludeFields={CONDITION_EXCLUDED_FILTER_FIELDS}
                parentName={`${parentName}.cases.${index}`}
              />
            </CardContent>
          </Card>
        ))}

        <Button
          className="w-full"
          onClick={() => append(conditionCaseDefaultFn())}
          type="button"
          variant="dashed"
        >
          <PlusIcon aria-hidden="true" className="me-1 size-4" />
          {t("flows.condition.addCase")}
        </Button>
      </div>
    </SequenceStoreProvider>
  )
}

export default ConditionStepEditor
