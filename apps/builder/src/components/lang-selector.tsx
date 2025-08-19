"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { useTolgee } from "@tolgee/react"
import type React from "react"
import { setLanguage } from "@/tolgee/language"

export const LangSelector: React.FC = () => {
  const tolgee = useTolgee(["language"])
  const locale = tolgee.getLanguage()

  function onSelectChange(value: string) {
    setLanguage(value)
  }
  return (
    <Select defaultValue={locale} onValueChange={onSelectChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a language" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="vi">Tiếng Việt</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
