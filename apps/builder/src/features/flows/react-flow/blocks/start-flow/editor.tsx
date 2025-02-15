"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Flow } from "@ahachat.ai/database"
import { T } from "@tolgee/react"
import { ExternalLink } from "lucide-react"
import type React from "react"
import { useFormContext } from "react-hook-form"

export const StartFlowBlockEditor = ({
  parentName,
  flows,
}: {
  parentName: string
  flows: Flow[]
}) => {
  const { register, setValue, watch } = useFormContext()
  const { name } = register(`${parentName}.flowId`)

  return (
    <>
      <div className="flex items-center gap-2 p-2 font-bold text-center break-all">
        <ExternalLink size={20} className="text-yellow-500" />
        <T keyName="flows.ActionType.StartFlow" />
      </div>
      <Select
        onValueChange={(value) => setValue(name, value)}
        name={name}
        defaultValue={watch(name)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a flow" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {flows.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                {flow.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}
