import { Button } from "@/components/ui/button"
import type { ButtonBlockSchema } from "./schema"

export const ButtonBlockViewer = ({ data }: { data: ButtonBlockSchema }) => {
  return (
    <Button type="button" variant="secondary" className="w-full" disabled>
      {data.label}
    </Button>
  )
}

export const ButtonGroupViewer = ({ data }: { data: ButtonBlockSchema[] }) => {
  return (
    <div className="flex flex-col gap-2">
      {data.map((button) => (
        <ButtonBlockViewer key={button.id} data={button} />
      ))}
    </div>
  )
}
