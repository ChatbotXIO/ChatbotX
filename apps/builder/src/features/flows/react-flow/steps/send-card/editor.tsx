"use client"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@aha.chat/ui/components/ui/card"
import { Input } from "@aha.chat/ui/components/ui/input"
import { useFormContext } from "react-hook-form"
import FileDropzone from "@/components/file-dropzone"

type SendCardStepEditorProps = {
  parentName: string
}

export const SendCardStepEditor = (props: SendCardStepEditorProps) => {
  const { parentName } = props
  const { register } = useFormContext()

  return (
    <Card className="w-full rounded-lg border-2 shadow-lg hover:cursor-pointer hover:border-blue-500 hover:border-solid">
      <CardHeader className="p-0">
        <FileDropzone
          configs={{
            uploadKeyName: "common.uploadImage",
            isCard: true,
          }}
          parentName={parentName}
          register={register}
        />
      </CardHeader>
      <CardContent className="bg-gray-200 p-2">
        <Input
          className="mb-2 border-0 focus-visible:border-none focus-visible:ring-0"
          placeholder="Title (Required)"
          {...register(`${parentName}.title`)}
        />

        <Input
          className="border-0 focus-visible:border-none focus-visible:ring-0"
          placeholder="Subtitle"
          {...register(`${parentName}.subtitle`)}
        />
      </CardContent>
      <CardFooter className="flex-col bg-gray-200 p-2">
        {/* <ButtonGroupEditor
          parentName={`${parentName}.buttons`}
          onEditButton={(name: string) => onEditButton(name)}
        /> */}
      </CardFooter>
    </Card>
  )
}
