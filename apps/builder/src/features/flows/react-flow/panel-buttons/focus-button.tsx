import { ControlButton, useReactFlow } from "@xyflow/react"
import { FocusIcon } from "lucide-react"

export default function FocusButton() {
  const { fitView } = useReactFlow()

  return (
    <ControlButton
      className="h-9! w-14! bg-zinc-100! p-0! dark:bg-neutral-500!"
      onClick={() => fitView()}
    >
      <FocusIcon className="max-h-full! max-w-full! fill-none!" />
    </ControlButton>
  )
}
