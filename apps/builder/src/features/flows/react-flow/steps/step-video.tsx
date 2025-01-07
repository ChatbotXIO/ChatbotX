'use client'

import { toast } from 'sonner';
import Dropzone from "react-dropzone";
import { cn } from '@/lib/utils';
import {MouseEventHandler, useEffect, useState} from "react";
import { Video, Undo2, CircleX } from 'lucide-react'
import { T } from "@tolgee/react"

import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StepVideoProps {
  key: number
  control: any
  blockName: string
  blockIndex: number
  itemIndex: number
}

export default function StepVideo({key, control, blockName, blockIndex, itemIndex}: StepVideoProps) {
  const { currentNode, updateCurrentNode } = useNodeEditorStore()
  const [video, setVideo] = useState({})
  const [isModeLink, setIsModeLink] = useState(false)

  const onDrop = ([ file ]: File[]) => {
    if (file) {
      const video: HTMLVideoElement = document.createElement('video');
      const canvas: HTMLCanvasElement = document.getElementById(`canvas-${itemIndex}`) as HTMLCanvasElement;
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

        setVideo({
          ...video,
          thumbnail: canvas.toDataURL('image/png')
        })

        URL.revokeObjectURL(fileURL);
      });

      video.addEventListener('error', () => {
        toast('Video error');
        URL.revokeObjectURL(fileURL);
      });
    }
  }

  const onChangeMode = (e: any) => {
    e.stopPropagation()
    setIsModeLink(!isModeLink)
  }

  const onRemoveFile = (e: MouseEventHandler<HTMLButtonElement>) => {
    e.stopPropagation()
    setVideo({
      ...video,
      thumbnail: '',
      file: null
    })
  }

  useEffect(() => {
    setVideo(currentNode.data.blocks[blockIndex].videos[itemIndex])
  }, []);

  const _noImage = () => {
    return (
      <div className="flex flex-col items-center">
        <Video size={30} className="text-gray-500"/>
        <div>
          <T keyName="common.uploadVideoOr"/>
          {"\u00A0"}
          <Button variant="link" onClick={onChangeMode} className="p-0 text-destructive">
            <T keyName="common.insertLink"/>
          </Button>
        </div>
      </div>
    )
  }

  const _hasImage = () => {
    return (
      <div className="relative">
        <img
          src={video?.thumbnail}
          className={cn(
            video?.thumbnail ? '' : 'hidden'
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

  const renderDropZone = () => {
    return (
      <>
        <canvas id={`canvas-${itemIndex}`} className="hidden"></canvas>
        <FormField
          key={key}
          control={control}
          name={`${blockName}[${itemIndex}].thumbnail`}
          render={({ field }) => (
            <FormItem>
              <Input className="hidden" { ...field } />
              <FormMessage />
            </FormItem>
          )}
        />
        <Dropzone
          maxFiles={1}
          accept={{"video/*": []}}
          onDrop={onDrop}
        >
          {({getRootProps, getInputProps}) => (
            <section>
              <div {...getRootProps()}>
                <input {...getInputProps()} />
                <div
                  className={cn(
                    'flex flex-col items-center border rounded-lg h-36 border-2 overflow-hidden justify-center hover:cursor-pointer hover:border-solid hover:border-blue-500',
                    video?.thumbnail ? 'border-solid' : 'border-dashed'
                  )}>
                  {
                    video?.thumbnail
                      ? _hasImage()
                      : _noImage()
                  }
                </div>
              </div>
            </section>
          )}
        </Dropzone>
      </>
    )
  }

  const renderVideoWithLink = () => {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-center gap-2 mb-2 relative">
          <Video size={25} className="text-gray-500"/><span>Video</span>

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
          name={`${blockName}[${itemIndex}].link`}
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

  return isModeLink ? renderVideoWithLink() : renderDropZone()
}
