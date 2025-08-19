import { Input } from "@aha.chat/ui/components/ui/input"
import { Slider } from "@aha.chat/ui/components/ui/slider"
import { useFormContext } from "react-hook-form"

export const SplitTrafficStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const { register } = useFormContext()

  return (
    <div className="flex flex-1 items-center gap-2 py-4">
      <Slider className="flex-1" defaultValue={[50]} max={100} step={1} />
      {/* </div>register={register} name={`${parentName}.value`} /> */}
      <Input className="w-14 flex-none" {...register(`${parentName}.value`)} />
      <span>%</span>
    </div>
  )
}
