"use client";

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog";

import { SingleSelect } from "@/components/single-select";

import { FormItem, FormLabel } from "@/components/ui/form";
import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field";

interface OpenAISpeechToTextEditorProps {
  parentName: string;
}

export const OpenAISpeechToTextEditor = ({
  parentName,
}: OpenAISpeechToTextEditorProps) => {
  return (
    <OpenAIDialog name="flows.OpenAI.Title.SpeechToText">
      <FormItem>
        <FormLabel>Audio</FormLabel>
        <SingleSelect
          value="chat_gpt_response"
          options={[{ value: "chat_gpt_response", label: "ChatGPT Response" }]}
          onValueChange={console.log}
        />
      </FormItem>

      <OpenAICustomField />
    </OpenAIDialog>
  );
};
