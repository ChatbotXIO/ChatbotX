import { ControlButton, useReactFlow } from "@xyflow/react"
import { ZoomInIcon } from "lucide-react"

export default function ZoomInButton() {
  const { zoomIn } = useReactFlow()

  return (
    <ControlButton
      className="h-9! w-14! bg-zinc-100! p-0! dark:bg-neutral-500!"
      onClick={() => zoomIn()}
    >
      <ZoomInIcon className="max-h-full! max-w-full! fill-none!" />
    </ControlButton>
  )
}
