"use client";

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog";

import { SingleSelect } from "@/components/single-select";

import { FormItem, FormLabel } from "@/components/ui/form";
import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field";
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/components/model";
import { OpenAIUserMessage } from "@/features/flows/react-flow/blocks/open-ai/components/user-message";

interface OpenAIGenerateTextAssistantEditorProps {
  parentName: string;
}

export const OpenAIGenerateTextAssistantEditor = ({
  parentName,
}: OpenAIGenerateTextAssistantEditorProps) => {
  return (
    <OpenAIDialog name="flows.OpenAI.Title.GenerateTextAssistant">
      <OpenAIModel onValueChange={console.log} />

      <FormItem>
        <FormLabel>Assistant</FormLabel>
        <SingleSelect
          value="troly"
          options={[
            {
              label: "Trợ Lý",
              value: "troly",
            },
            {
              label: "AI TL",
              value: "ai-tl",
            },
          ]}
          onValueChange={console.log}
        />
      </FormItem>

      <OpenAIUserMessage />

      <OpenAICustomField />
    </OpenAIDialog>
  );
};
