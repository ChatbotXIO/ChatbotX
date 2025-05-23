"use client"

import { T } from "@tolgee/react"
import { MessageCirclePlusIcon } from "lucide-react"

const AssignConversationStepEditor = ({
  // biome-ignore lint/correctness/noUnusedVariables: <explanation>
  parentName,
}: {
  parentName: string
}) => {
  // const { register, setValue } = useFormContext()
  // const { name } = register(`${parentName}.recipientId`)
  // const onSelectChange = (id: string) => {
  //   setValue(name, id)
  //   const recipient = recipients.find((obj) => obj.id === id)
  //   setValue(`${parentName}.recipientName`, recipient?.name ?? "")
  // }

  return (
    <>
      <div className="flex justify-center items-center gap-2 p-2 font-bold text-center break-all">
        <MessageCirclePlusIcon size={20} className="text-yellow-500" />
        <T keyName="flows.StepType.AssignConversation" />
      </div>
      {/* <Select onValueChange={onSelectChange} name={name}>
        <SelectTrigger>
          <SelectValue placeholder="Select a admin" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {recipients.map((recipient) => (
              <SelectItem key={recipient.id} value={recipient.id}>
                {recipient.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select> */}
    </>
  )
}

export { AssignConversationStepEditor }
