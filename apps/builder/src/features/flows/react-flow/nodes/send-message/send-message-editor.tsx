import InputWithEmoji from "@/components/input-with-emoji";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslate } from "@tolgee/react";
import { useForm } from "react-hook-form";
import { SendMessageEditorItemType, SendMessageEditorItem } from "./menu";
import SendMessageEditorAction from "./send-message-editor-action";
import { Separator } from "@/components/ui/separator";
import { DndContext } from "@dnd-kit/core";
import { createId } from '@paralleldrive/cuid2';

import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";

import type { NodeBlock } from "@/features/flows/react-flow/blocks/types";
import dynamic from "next/dynamic";

// Node block
const StepImage = dynamic(() => import('../../steps/step-image'))
const StepCard = dynamic(() => import('../../steps/step-card'))

const prototypeItem = new Map()
  .set(SendMessageEditorItem.Image, 'images')
  .set(SendMessageEditorItem.Card, 'cards')
  .set(SendMessageEditorItem.Text, 'text')
  .set(SendMessageEditorItem.Video, 'videos')
  .set(SendMessageEditorItem.Carousel, 'carousel')

export default function SendMessageEditor() {
  const { t } = useTranslate()
  const { currentNode, updateCurrentNode } = useNodeEditorStore()

  const form = useForm()

  const onClickAction = (name: SendMessageEditorItemType) => {
    console.log('onClickActionnnnn', name)

    const newCurrentNode = { ...currentNode }
    const newBlock: Partial<NodeBlock> = {
      id: createId(),
      key: name,
    }
    Object.defineProperty(newBlock, prototypeItem.get(name), {
      value: [
        {
          id: createId(),
        }
      ],
      writable: true,
      enumerable: true,
    })
    newCurrentNode.data?.blocks.push(newBlock)
    updateCurrentNode(newCurrentNode)
  }

  const renderBlockItem = (block: NodeBlock, blockIndex: number) => {
    if (block.key === SendMessageEditorItem.Image) {
      return block.images && block.images.map((img, idx: number) => <StepImage key={idx} blockIndex={blockIndex} itemIndex={idx} />)
    }
    if (block.key === SendMessageEditorItem.Card) {
      return block.cards && block.cards.map((img, idx: number) => <StepCard key={idx} blockIndex={blockIndex} itemIndex={idx} />)
    }
  }

  const renderBlocks = () => {
    if (currentNode && currentNode.data && currentNode.data.blocks) {
      return currentNode.data.blocks.map((block: NodeBlock, idx: number) => renderBlockItem(block, idx))
    }
    return null
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={() => { }}>
          <FormField control={form.control} name="channel" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('flows.sendMessageNode.channel')}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Omnichannel">Omnichannel</SelectItem>
                  <SelectItem value="Messenger">Messenger</SelectItem>
                  <SelectItem value="Whatsapp">Whatsapp</SelectItem>
                  <SelectItem value="Webchat">Webchat</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
          />
        </form>
      </Form>

      <Separator />

      <div className="flex flex-col flex-1 gap-4">
        <DndContext>
          {/* <Draggable /> */}
        </DndContext>
        <InputWithEmoji />
        { renderBlocks() }
      </div>

      <SendMessageEditorAction onClick={onClickAction} />
    </>
  )
}
