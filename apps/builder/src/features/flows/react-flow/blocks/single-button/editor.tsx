import { Button } from "@/components/ui/button"
import { useFormContext } from "react-hook-form"

export const SingleButtonBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: string
}) => {
  const { watch } = useFormContext()

  const singleButtonName = watch(`${parentName}.name`)

  return (
    <div className="w-full flex-1" {...rest}>
      <Button className="w-full">{singleButtonName}</Button>
    </div>
  )
}
