import { FormInput } from "@/components/form-input"

export const HeadingBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: `blocks.${number}`
}) => {
  return (
    <div className="w-full flex-1" {...rest}>
      <FormInput
        inputType="textarea"
        name={`${parentName}.heading`}
        label={""}
      />
    </div>
  )
}
