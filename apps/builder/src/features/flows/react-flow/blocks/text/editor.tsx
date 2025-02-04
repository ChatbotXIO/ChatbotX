import { FormInput } from "@/components/form-input"

export const TextBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: `blocks.${number}`
}) => {
  return (
    <div className="w-full flex-1" {...rest}>
      <FormInput name={`${parentName}.text`} label={""} inputType="textarea" />
    </div>
  )
}
