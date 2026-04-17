"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { Slider } from "@chatbotx.io/ui/components/ui/slider"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FieldError, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { ErrorAlert } from "../error-alert"

type SplitTrafficStepEditorProps = {
  parentName: string
}

const SplitTrafficStepEditor = ({
  parentName,
}: SplitTrafficStepEditorProps) => {
  const t = useTranslations()
  const { control, setValue, watch, getFieldState, formState } =
    useFormContext()

  const { fields, append, remove } = useFieldArray({
    control,
    name: `${parentName}.cases`,
  })

  const cases = useWatch({ control, name: `${parentName}.cases` })
  const casesFieldState = getFieldState(`${parentName}.cases`, formState)

  const errorMessage = (
    casesFieldState.error as FieldError & {
      cases?: FieldError
    }
  )?.cases?.message

  const handleSliderChange = (index: number, newValue: number[]) => {
    setValue(`${parentName}.cases.${index}.value`, newValue[0])
  }

  const handleInputChange = (index: number, inputValue: string) => {
    const numValue = Number.parseInt(inputValue, 10)
    if (!Number.isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setValue(`${parentName}.cases.${index}.value`, numValue)
    }
  }

  const addVariation = () => {
    append({ value: 50, nodeId: null })
  }

  const handleRemove = (index: number) => {
    if (fields.length > 1) {
      remove(index)
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          {errorMessage && <ErrorAlert message={errorMessage} />}
          {t("flows.actions.splitTraffic")}
        </div>
        <div className="text-base text-muted-foreground">
          {t("flows.splitTraffic.balanceHint")}
        </div>
      </div>
      {fields.map((field, index) => (
        <div className="group relative" key={field.id}>
          <div className="flex flex-1 items-center gap-3 py-12">
            <Slider
              className="flex-1"
              max={100}
              onValueChange={(value) => handleSliderChange(index, value)}
              step={1}
              value={[cases?.[index]?.value ?? 0]}
            />
            <Input
              className={`w-16 flex-none text-center ${errorMessage ? "border-destructive" : ""}`}
              max={100}
              min={0}
              onChange={(e) => handleInputChange(index, e.target.value)}
              type="number"
              value={cases?.[index]?.value ?? 0}
            />
            <span>%</span>
          </div>
          <Button
            className="absolute top-0 right-0 z-50 h-8 w-8 cursor-pointer bg-background p-0 opacity-0 shadow-sm transition-opacity hover:bg-accent/10 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              handleRemove(index)
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4 text-muted-foreground hover:text-destructive group-hover:opacity-100" />
          </Button>
          {index < fields.length - 1 && <Separator />}
        </div>
      ))}

      <Button
        className="mt-4 w-full"
        onClick={addVariation}
        type="button"
        variant="dashed"
      >
        <PlusIcon className="mr-1 size-4" />
        {t("flows.splitTraffic.addVariation")}
      </Button>
    </div>
  )
}

export default SplitTrafficStepEditor
