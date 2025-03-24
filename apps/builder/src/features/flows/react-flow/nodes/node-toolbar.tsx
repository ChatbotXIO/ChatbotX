import { Button } from "@/components/ui/button"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"

interface IToolbarItem {
  icon: IconName
  label: string
  onClick: () => void
}

export function FlowNodeToolbar() {
  const configs: IToolbarItem[] = [
    {
      icon: "eye",
      label: "flows.previewBtn",
      onClick: () => {},
    },
    {
      icon: "play",
      label: "flows.setAsStartingStepBtn",
      onClick: () => {},
    },
    {
      icon: "link",
      label: "flows.getPublishedLinkBtn",
      onClick: () => {},
    },
    {
      icon: "fingerprint",
      label: "flows.getStepIdBtn",
      onClick: () => {},
    },
    {
      icon: "type",
      label: "flows.renameBtn",
      onClick: () => {},
    },
    {
      icon: "copy",
      label: "flows.duplicateBtn",
      onClick: () => {},
    },
    {
      icon: "trash-2",
      label: "flows.deleteBtn",
      onClick: () => {},
    },
  ]

  return (
    <div className="flex gap-2 justify-center bg-white border rounded-md py-1">
      {configs.map((config) => (
        <Button variant="ghost" size="xs" key={config.label}>
          <DynamicIcon name={config.icon} />
        </Button>
      ))}
    </div>
  )
}
