import { FormLabel } from "@/components/ui/form"
import { ButtonActionType } from "@/features/flows/react-flow/blocks/button/schema"
import { cn } from "@/lib/utils"
import { useTranslate } from "@tolgee/react"
import {
  ExternalLinkIcon,
  LinkIcon,
  MessageCirclePlus,
  PhoneIcon,
  StepForwardIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"

export const ButtonActionSelect = ({
  name,
  label,
  onSelect,
}: {
  name: string
  label: string
  onSelect: (value: ButtonActionType | null) => void
}) => {
  const { t } = useTranslate()
  const { watch } = useFormContext()
  const type = watch("type")

  const options = useMemo(
    () => [
      {
        label: t(`flows.ButtonAction.${ButtonActionType.SendMessage}`),
        value: ButtonActionType.SendMessage,
        icon: <MessageCirclePlus />,
      },
      {
        label: t(`flows.ButtonAction.${ButtonActionType.OpenWebsite}`),
        value: ButtonActionType.OpenWebsite,
        icon: <LinkIcon />,
      },
      {
        label: t(`flows.ButtonAction.${ButtonActionType.CallPhoneNumber}`),
        value: ButtonActionType.CallPhoneNumber,
        icon: <PhoneIcon />,
      },
      {
        label: t(`flows.ButtonAction.${ButtonActionType.PerformAction}`),
        value: ButtonActionType.PerformAction,
        icon: <ZapIcon />,
      },
      {
        label: t(`flows.ButtonAction.${ButtonActionType.StartAnotherFlow}`),
        value: ButtonActionType.StartAnotherFlow,
        icon: <ExternalLinkIcon />,
      },
      {
        label: t(`flows.ButtonAction.${ButtonActionType.StartAnotherStep}`),
        value: ButtonActionType.StartAnotherStep,
        icon: <StepForwardIcon />,
      },
      {
        label: t(`flows.ButtonAction.${ButtonActionType.StartExternalStep}`),
        value: ButtonActionType.StartExternalStep,
        icon: <ExternalLinkIcon />,
      },
    ],
    [t],
  )

  const filterOptions = useMemo(() => {
    return options.filter((option) => {
      return !type || type === option.value
    })
  }, [options, type])

  return (
    <>
      <FormLabel className="flex gap-1">{label}</FormLabel>
      <div className="flex flex-col items-center gap-2">
        {filterOptions.map((option) => (
          <div
            key={option.value}
            className={cn(
              "w-full flex border rounded-lg p-3",
              type === option.value
                ? "border-blue-500 text-blue-500"
                : "border-gray-500 text-gray-500 cursor-pointer",
            )}
            onClick={() => onSelect(option.value)}
            onKeyDown={() => {}}
          >
            <div className="w-8">{option.icon}</div>
            <div className="flex-1 text-center">{option.label}</div>
            <div className="w-8 cursor-pointer">
              {type === option.value && (
                <XIcon
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(null)
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
