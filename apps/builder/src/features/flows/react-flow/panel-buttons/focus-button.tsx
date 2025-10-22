import { ControlButton, useReactFlow } from "@xyflow/react"
import { FocusIcon } from "lucide-react"

export default function FocusButton() {
  const { fitView } = useReactFlow()

  return (
    <ControlButton className="h-9! w-14! p-0!" onClick={() => fitView()}>
      <FocusIcon className="max-h-full! max-w-full! fill-none!" />
    </ControlButton>
  )
}
