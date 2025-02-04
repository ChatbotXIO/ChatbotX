import { FormInput } from "@/components/form-input"

export const CodeBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: `blocks.${number}`
}) => {
  return (
    <div className="w-full flex-1" {...rest}>
      <FormInput name={`${parentName}.code`} label={""} inputType="textarea" />
    </div>
  )
}
