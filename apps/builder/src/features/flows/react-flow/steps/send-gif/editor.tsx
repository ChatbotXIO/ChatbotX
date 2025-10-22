"use client"

import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Input } from "@aha.chat/ui/components/ui/input"
import { useDebouncedCallback } from "@aha.chat/ui/hooks/use-debounced-callback"
import type { IGif } from "@giphy/js-types"
import { ImagePlayIcon } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { type SyntheticEvent, useState } from "react"
import { useFormContext } from "react-hook-form"
import { GifFinder } from "@/components/gif-finder"
import { BaseStepEditor } from "../base/editor"

const FindGifDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [searchText, setSearchText] = useState("")
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()
  const gifUrl = getValues(`${parentName}.url`)

  const handleChanges = useDebouncedCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchText(e.target.value)
    },
    300,
  )

  const handleGifSelect = (
    gif: IGif,
    e: SyntheticEvent<HTMLElement, Event>,
  ) => {
    setValue(`${parentName}.url`, gif.images.preview_gif.url)
    setOpen(false)
    e.preventDefault()
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          {gifUrl && gifUrl.length > 0 ? (
            <Button
              className="!p-0 relative h-[150px] w-[240px]"
              variant="ghost"
            >
              <Image alt={parentName} fill={true} src={gifUrl} />
            </Button>
          ) : (
            <Button size="sm" type="button" variant="outline">
              {t("actions.findGif")}
            </Button>
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-scroll lg:max-w-screen-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.poweredBy", { name: "GIPHY" })}</DialogTitle>
        </DialogHeader>
        <FormFieldWrapper name={`${parentName}.url`}>
          {(field) => <Input type="hidden" {...field} />}
        </FormFieldWrapper>
        <Input
          name={`${parentName}.searchText`}
          onChange={handleChanges}
          placeholder={t("actions.search")}
        />
        <div className="h-[calc(100vh-300px)] overflow-y-auto overflow-x-hidden">
          <GifFinder
            apiKey="9qVnq1KhqjWFWfpjkBfPV32rcMhViwWH"
            handleGifClick={handleGifSelect}
            height={window.innerHeight}
            searched={searchText.length > 0}
            searchQuery={searchText}
            width={window.innerWidth}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function SendGifStepEditor({
  parentName,
}: {
  parentName: string
}) {
  return (
    <BaseStepEditor icon={ImagePlayIcon} title="GIF">
      <FindGifDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

export { SendGifStepEditor }
