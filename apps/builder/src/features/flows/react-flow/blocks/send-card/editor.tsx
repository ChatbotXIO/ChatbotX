"use client"

import FileDropzone from "@/components/file-dropzone"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useFormContext } from "react-hook-form"
import { ButtonGroupEditor } from "../button/editor"

export const SendCardBlockEditor = ({ parentName }: { parentName: string }) => {
  const { register } = useFormContext()

  return (
    <Card className="w-full shadow-lg rounded-lg border-2 hover:border-blue-500 hover:border-solid hover:cursor-pointer">
      <CardHeader className="p-0">
        <FileDropzone
          register={register}
          parentName={parentName}
          configs={{
            uploadKeyName: "common.uploadImage",
            isCard: true,
          }}
        />
      </CardHeader>
      <CardContent className="p-2 bg-gray-200">
        <Input
          placeholder="Title (Required)"
          className="mb-2 border-0 focus-visible:ring-0 focus-visible:border-none"
          {...register(`${parentName}.title`)}
        />

        <Input
          placeholder="Subtitle"
          className="border-0 focus-visible:ring-0 focus-visible:border-none"
          {...register(`${parentName}.subtitle`)}
        />
      </CardContent>
      <CardFooter className="p-2 bg-gray-200 flex-col">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </CardFooter>
    </Card>
  )
}
