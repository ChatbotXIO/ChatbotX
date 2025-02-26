import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { GenerateType } from "@/features/flows/react-flow/blocks/generate-random-code/schema"
import { useTranslate } from "@tolgee/react"
import { useMemo } from "react"

export const GenerateTypeSelect = ({ name, ...props }: { name: string }) => {
  const { t } = useTranslate()
  const options = useMemo(() => {
    return [
      {
        value: GenerateType.NumericMinMaxLength,
        label: t("flows.GenerateType.NumericMinMaxLength"),
      },
      {
        value: GenerateType.NumericMinMaxNumber,
        label: t("flows.GenerateType.NumericMinMaxNumber"),
      },
      {
        value: GenerateType.AlphanumericMinMaxLength,
        label: t("flows.GenerateType.AlphanumericMinMaxLength"),
      },
    ]
  }, [t])

  return (
    <FormInput name={name} label={t("common.type")}>
      <SingleSelect
        name={name}
        placeholder="Select type"
        options={options}
        {...props}
      />
    </FormInput>
  )
}
