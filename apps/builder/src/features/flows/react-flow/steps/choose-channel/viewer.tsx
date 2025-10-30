"use client"

import type { ChooseChannelStepSchema } from "@aha.chat/flow-config"
import { InboxIcon } from "lucide-react"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepViewer } from "../base/viewer"

const ChooseChannelStepViewer = ({
  data,
}: {
  data: ChooseChannelStepSchema
}) => {
  const channelOptions = useStepStore((state) => state.channelOptions)
  const channelOption = channelOptions.find(
    (option) => option.value === data.channel,
  )

  return (
    <BaseStepViewer
      icon={InboxIcon}
      title={channelOption?.label ?? "Omnichannel"}
    />
  )
}

export default ChooseChannelStepViewer
