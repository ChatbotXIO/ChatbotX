"use client"

import { T } from "@tolgee/react"
import { MessageCirclePlusIcon } from "lucide-react"

const AutoAssignConversationStepEditor = ({
  // biome-ignore lint/correctness/noUnusedVariables: <explanation>
  parentName,
}: {
  parentName: string
}) => {
  // const selectedRecipients = watch(name)
  // const recipientsList = useMemo(() => {
  //   return recipients.map((obj) => {
  //     return {
  //       value: obj.id,
  //       label: obj.name,
  //     }
  //   })
  // }, [recipients])

  return (
    <>
      <div className="flex justify-center items-center gap-2 p-2 font-bold text-center break-all">
        <MessageCirclePlusIcon size={20} className="text-yellow-500" />
        <T keyName="flows.StepType.AutoAssignConversation" />
      </div>
      {/* <MultiSelect
        options={recipientsList}
        onValueChange={(value) => setValue(name, value)}
        defaultValue={selectedRecipients}
        placeholder="Select options"
        variant="inverted"
        animation={2}
        maxCount={3}
      /> */}
    </>
  )
}

export { AutoAssignConversationStepEditor }
