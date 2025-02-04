import { Separator } from "@/components/ui/separator"

export const LineBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: string
}) => {
  return (
    <div className="w-full flex-1" {...rest}>
      <Separator className="my-2" />
    </div>
  )
}
