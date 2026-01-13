import { ControlButton, useReactFlow } from "@xyflow/react"
import { ZoomOutIcon } from "lucide-react"

export default function ZoomOutButton() {
  const { zoomOut } = useReactFlow()

  return (
    <ControlButton
      className="h-9! w-14! p-0! dark:bg-neutral-500!"
      onClick={() => zoomOut()}
    >
      <ZoomOutIcon className="max-h-full! max-w-full! fill-none!" />
    </ControlButton>
  )
}
