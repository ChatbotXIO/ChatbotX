import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useTranslate } from "@tolgee/react"
import { ControlButton } from "@xyflow/react"
import {
  ClockIcon,
  CompassIcon,
  ExternalLinkIcon,
  FilterIcon,
  InfoIcon,
  MailIcon,
  MessageCircleMoreIcon,
  Plus,
  ShuffleIcon,
  ZapIcon,
} from "lucide-react"
import { useState } from "react"
import { NodeType } from "../types"

export function AddBlockButton({
  onChooseAction,
}: {
  onChooseAction: (name: NodeType) => void
}) {
  const { t } = useTranslate()

  const [open, setOpen] = useState(false)
  const onClickAction = (name: NodeType) => {
    onChooseAction(name)
    setOpen(false)
  }

  const buttons = [
    {
      type: NodeType.SendMessage,
      icon: <MessageCircleMoreIcon />,
      label: t("flows.sendMessageBtn"),
      proFeature: false,
      onClick: () => onClickAction(NodeType.SendMessage),
    },
    {
      type: NodeType.StartFlow,
      icon: <ExternalLinkIcon />,
      label: t("flows.startFlowBtn"),
      proFeature: false,
      onClick: () => onClickAction(NodeType.StartFlow),
    },
    {
      type: NodeType.Actions,
      icon: <ZapIcon />,
      label: t("flows.actionsBtn"),
      proFeature: false,
      onClick: () => onClickAction(NodeType.Actions),
    },
    {
      type: NodeType.Condition,
      icon: <FilterIcon />,
      label: t("flows.conditionBtn"),
      proFeature: true,
      onClick: () => onClickAction(NodeType.Condition),
    },
    {
      type: NodeType.SendMail,
      icon: <MailIcon />,
      label: t("flows.sendMailBtn"),
      proFeature: true,
      onClick: () => onClickAction(NodeType.SendMail),
    },
    {
      type: NodeType.SplitTraffic,
      icon: <ShuffleIcon />,
      label: t("flows.splitTrafficBtn"),
      proFeature: true,
      onClick: () => onClickAction(NodeType.SplitTraffic),
    },
    {
      type: NodeType.Wait,
      icon: <ClockIcon />,
      label: t("flows.waitBtn"),
      proFeature: true,
      onClick: () => onClickAction(NodeType.Wait),
    },
    {
      type: NodeType.LandingPage,
      icon: <CompassIcon />,
      label: t("flows.landingPageBtn"),
      proFeature: true,
      onClick: () => onClickAction(NodeType.LandingPage),
    },
    {
      type: NodeType.AddNotes,
      icon: <InfoIcon />,
      label: t("flows.addNotesBtn"),
      proFeature: false,
      onClick: () => onClickAction(NodeType.AddNotes),
    },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ControlButton>
          <Plus />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col items-start">
          {buttons.map((item) => {
            return (
              <Button
                key={item.label}
                variant="ghost"
                className="w-full justify-start"
                onClick={item.onClick}
              >
                {item.icon}
                {item.label}
                {item.proFeature && <Badge variant="destructive">Pro</Badge>}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
