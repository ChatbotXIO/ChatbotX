"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { T } from "@tolgee/react"
import { useFormContext } from "react-hook-form"

const DisableBotBlockEditor = ({ parentName }: { parentName: string }) => {
  const { watch, register, setValue } = useFormContext()
  const { name } = register(`${parentName}.notifyAdmin`)
  const notifyAdmin = watch(name)

  return (
    <>
      <div className="font-bold text-center break-all">
        <T keyName="flows.ActionType.DisableBot" />
      </div>
      <div className="flex items-center justify-center space-x-2 mt-1">
        <Checkbox
          id="notifyAdmin"
          name={name}
          defaultChecked={notifyAdmin}
          onCheckedChange={(checked) => setValue(name, checked)}
        />
        <label
          htmlFor="notifyAdmin"
          className="text-sm font-medium leading-none cursor-pointer"
        >
          <T keyName="flows.notifyAdmin" />
        </label>
      </div>
    </>
  )
}

export { DisableBotBlockEditor }
