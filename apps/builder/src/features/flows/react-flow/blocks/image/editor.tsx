import { FormInput } from "@/components/form-input"

export const ImageBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: `blocks.${number}`
}) => {
  return (
    <div className="w-full flex-1" {...rest}>
      <FormInput name={`${parentName}.url`} label={""} />
    </div>
  )
}
