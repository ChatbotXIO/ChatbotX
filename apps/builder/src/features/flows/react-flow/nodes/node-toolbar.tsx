import { Button } from "@/components/ui/button"
import {
  CopyIcon,
  EyeIcon,
  FingerprintIcon,
  LinkIcon,
  type LucideIcon,
  PlayIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"

interface IToolbarItem {
  icon: LucideIcon
  label: string
  onClick: () => void
}

export function FlowNodeToolbar() {
  const configs: IToolbarItem[] = [
    {
      icon: EyeIcon,
      label: "flows.previewBtn",
      onClick: () => {},
    },
    {
      icon: PlayIcon,
      label: "flows.setAsStartingStepBtn",
      onClick: () => {},
    },
    {
      icon: LinkIcon,
      label: "flows.getPublishedLinkBtn",
      onClick: () => {},
    },
    {
      icon: FingerprintIcon,
      label: "flows.getStepIdBtn",
      onClick: () => {},
    },
    {
      icon: TypeIcon,
      label: "flows.renameBtn",
      onClick: () => {},
    },
    {
      icon: CopyIcon,
      label: "flows.duplicateBtn",
      onClick: () => {},
    },
    {
      icon: Trash2Icon,
      label: "flows.deleteBtn",
      onClick: () => {},
    },
  ]

  return (
    <div className="flex gap-2 justify-center bg-white border rounded-md py-1">
      {configs.map((config) => (
        <Button variant="ghost" size="sm" key={config.label}>
          <config.icon />
        </Button>
      ))}
    </div>
  )
}
