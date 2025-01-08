'use client'

import { useState } from "react";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Video, File, Volume2, Image, ImagePlay, Undo2, X } from "lucide-react";
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
  mode?: 'file' | 'link'
  configs: {
    uploadKeyName?: string
    linkKeyName?: string
    accept?: Record<string, string[]>,
    maxSize?: number
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
    mode = 'file',
    configs: {
      uploadKeyName =  'common.uploadImageOr',
      linkKeyName = 'common.insertLink',
      accept = {"image/*": []},
      maxSize = 10
    },
    block, key, control, itemIndex,
    onMode, onRemove, onDrop
  }: NodeBlockUploadEditorProps
) {
  const [preview, setPreview] = useState('')
  const [fileMode, setFileMode] = useState<'file' | 'link'>(mode);

  const _validateSize = (file: File) => file.size > maxSize * 1024 * 1024

  const _videoPreview = (file: File) => {
    const video: HTMLVideoElement = document.createElement('video');
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d') as CanvasRenderingContext2D;

    const fileURL = URL.createObjectURL(file);
    video.src = fileURL;

    video.addEventListener('loadeddata', function() {
      video.currentTime = 1;
    });

    video.addEventListener('seeked', function() {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setPreview(canvas.toDataURL('image/png'))
      URL.revokeObjectURL(fileURL);
    });

    video.addEventListener('error', () => {
      toast('Video error');
      URL.revokeObjectURL(fileURL);
    });
  }

  const _imagePreview = (file: File) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const _onDrop = ([ file ]: File[]) => {
    if (file) {
      if (_validateSize(file)) {
        return toast('common.upload.fileMaxSize')
      }

      if (file.type.includes(UploadType.Video)) {
        _videoPreview(file)
      }

      if (file.type.includes(UploadType.Image)) {
        _imagePreview(file)
      }

      onDrop(file)
    }
  }

  const _onRemove = (e: any) => {
    e.stopPropagation()
    onRemove()
  }

  const _onMode = (e: any) => {
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
          <Button variant="link" onClick={_onMode} className="p-0 text-destructive">
            <T keyName={linkKeyName} />
          </Button>
        </div>
      </div>
    )
  }

  const _hasFile = () => {
    return (
      <>
        <img
          src={preview}
          className='w-full h-full object-cover'
          alt="Thumbnail"
        />
        <div className="absolute top-1 right-1 z-10">
          <Button variant="outline" size="icon" className="rounded-full size-5" onClick={_onRemove}>
            <X size={10} />
          </Button>
        </div>
      </>
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
          onDrop={_onDrop}
        >
          {({getRootProps, getInputProps}) => (
            <section>
              <div {...getRootProps()}>
                <input {...getInputProps()} />
                <div
                  className={cn(
                    'relative flex flex-col items-center rounded-lg h-36 border-2 overflow-hidden justify-center hover:cursor-pointer hover:border-solid hover:border-blue-500',
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
                  <Button variant="link" onClick={_onMode}>
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
