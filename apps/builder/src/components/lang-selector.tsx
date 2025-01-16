"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setLanguage } from "@/tolgee/language"
import { useTolgee } from "@tolgee/react"
import type React from "react"

export const LangSelector: React.FC = () => {
  const tolgee = useTolgee(["language"])
  const locale = tolgee.getLanguage()

  function onSelectChange(value: string) {
    setLanguage(value)
  }
  return (
    <Select onValueChange={onSelectChange} defaultValue={locale}>
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
