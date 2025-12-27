"use client"

import type { ChooseChannelStepSchema } from "@aha.chat/flow-config"
import { InboxIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useConfiguredInboxTypeOptions } from "@/features/inboxes/provider/inbox-hook"
import { BaseStepViewer } from "../base/viewer"

const ChooseChannelStepViewer = ({
  data,
}: {
  data: ChooseChannelStepSchema
}) => {
  const channelOptions = useConfiguredInboxTypeOptions()
  const [selectedChannel, setSelectedChannel] = useState<string>("Omnichannel")

  useEffect(() => {
    const channelOption = channelOptions.find(
      (option) => option.value === data.channel,
    )
    if (channelOption) {
      setSelectedChannel(channelOption.label)
    }
  }, [data.channel, channelOptions])

  return <BaseStepViewer icon={InboxIcon} title={selectedChannel} />
}

export default ChooseChannelStepViewer
