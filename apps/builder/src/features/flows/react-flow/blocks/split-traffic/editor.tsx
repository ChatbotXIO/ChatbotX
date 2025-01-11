import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { useFormContext } from "react-hook-form"

export const SplitTrafficBlockEditor = ({
  parentName,
}: { parentName: string }) => {
  const { register } = useFormContext()

  return (
    <div className="flex flex-1 gap-2 items-center py-4">
      <Slider defaultValue={[50]} max={100} step={1} className="flex-1" />
      {/* </div>register={register} name={`${parentName}.value`} /> */}
      <Input className="flex-none w-14" {...register(`${parentName}.value`)} />
      <span>%</span>
    </div>
  )
}
