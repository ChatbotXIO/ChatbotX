'use client'

import { useState } from "react";
import { cn } from '@/lib/utils';
import { Video, File, Volume2, Image, ImagePlay, Undo2, CircleX } from "lucide-react";
import { T } from "@tolgee/react";
import Dropzone from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

enum UploadType {
  Video = 'video',
  Image = 'image',
  File = 'file',
  Audio = 'audio',
  Gif = 'gif',
}

interface NodeBlockUploadEditorProps {
  type: 'video' | 'image' | 'file' | 'audio' | 'gif'
  mode: 'file' | 'link'
  preview?: string
  configs: {
    uploadKeyName: string
    linkKeyName: string
    accept: Record<string, unknown>
  }
  key: number
  control: any
  block: {
    name: string,
    index?: number
  }
  itemIndex: number
  onMode: (mode: 'file' | 'link') => void
  onRemove: () => void
  onDrop: (file: File) => void
}

export default function NodeBlockUploadEditor(
  {
    type = UploadType.Image,
    preview = '',
    mode = 'file',
    configs: {
      uploadKeyName =  'common.uploadImageOr',
      linkKeyName = 'common.insertLink',
      accept = {"image/*": []}
    },
    block, key, control, itemIndex,
    onMode, onRemove, onDrop
  }: NodeBlockUploadEditorProps
) {
  const [fileMode, setFileMode] = useState<'file' | 'link'>(mode);

  const onDropFile = ([ file ]: File[]) => {
    if (file) {
      onDrop(file)
    }
  }

  const onRemoveFile = (e: any) => {
    e.stopPropagation()
    onRemove()
  }

  const onChangeMode = (e: any) => {
    e.stopPropagation()
    setFileMode(fileMode === 'file' ? 'link' : 'file');
    onMode(fileMode)
  }

  const _uploadIcon = (size: number = 30) => {
    switch (type) {
      case UploadType.Video:
        return <Video size={size} className="text-gray-500"/>
      case UploadType.File:
        return <File size={size} className="text-gray-500"/>
      case UploadType.Audio:
        return <Volume2 size={size} className="text-gray-500" />
      case UploadType.Gif:
        return <ImagePlay size={size} className="text-gray-500" />
      default:
        return <Image size={size} className="text-gray-500"/>
    }
  }

  const _noFile = () => {
    return (
      <div className="flex flex-col items-center">
        { _uploadIcon() }
        <div>
          <T keyName={uploadKeyName}/>
          {"\u00A0"}
          <Button variant="link" onClick={onChangeMode} className="p-0 text-destructive">
            <T keyName={linkKeyName} />
          </Button>
        </div>
      </div>
    )
  }

  const _hasFile = () => {
    return (
      <div className="relative">
        <img
          src={preview}
          className={cn(
            preview ? '' : 'hidden'
          )}
          alt="Thumbnail"
        />
        <div className="absolute top-4 right-1 z-10">
          <Button variant="link" className="p-1" onClick={onRemoveFile}>
            <CircleX size={20} color="red" />
          </Button>
        </div>
      </div>
    )
  }

  const dropZone = () => {
    return (
      <>
        <FormField
          key={key}
          control={control}
          name={`${block.name}[${itemIndex}].thumbnail`}
          render={({ field }) => (
            <FormItem>
              <Input className="hidden" { ...field } />
              <FormMessage />
            </FormItem>
          )}
        />
        <Dropzone
          maxFiles={1}
          accept={accept}
          onDrop={onDropFile}
        >
          {({getRootProps, getInputProps}) => (
            <section>
              <div {...getRootProps()}>
                <input {...getInputProps()} />
                <div
                  className={cn(
                    'flex flex-col items-center border rounded-lg h-36 border-2 overflow-hidden justify-center hover:cursor-pointer hover:border-solid hover:border-blue-500',
                    preview ? 'border-solid' : 'border-dashed'
                  )}>
                  { preview ? _hasFile() : _noFile() }
                </div>
              </div>
            </section>
          )}
        </Dropzone>
      </>
    )
  }

  const inputLink = () => {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-center gap-2 mb-2 relative">
          { _uploadIcon(25) } <span className="capitalize">{ type }</span>

          <div className="absolute right-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="link" onClick={onChangeMode}>
                    <Undo2 size={20}/>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload File</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <FormField
          key={key}
          control={control}
          name={`${block.name}[${itemIndex}].link`}
          render={({field}) => (
            <FormItem>
              <Input className="rounded-full" placeholder="Insert link" {...field} />
              <FormMessage/>
            </FormItem>
          )}
        />
      </div>
    )
  }

  return fileMode === 'file' ? dropZone() : inputLink()
}
