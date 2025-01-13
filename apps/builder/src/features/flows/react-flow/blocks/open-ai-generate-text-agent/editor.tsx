"use client";

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog";

import { NumberField } from "@/components/number-field";
import { SingleSelect } from "@/components/single-select";

import { FormItem, FormLabel } from "@/components/ui/form";
import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field";
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/components/model";
import { OpenAITrigger } from "@/features/flows/react-flow/blocks/open-ai/components/trigger";
import { OpenAIUserMessage } from "@/features/flows/react-flow/blocks/open-ai/components/user-message";

interface OpenAIGenerateTextAgentEditorProps {
  parentName: string;
}

export const OpenAIGenerateTextAgentEditor = ({
  parentName,
}: OpenAIGenerateTextAgentEditorProps) => {
  return (
    <OpenAIDialog name="flows.OpenAI.Title.GenerateTextAgent">
      <OpenAIModel onValueChange={console.log} />

      <FormItem>
        <FormLabel>Agents</FormLabel>
        <SingleSelect
          value="prompt-1"
          options={[
            {
              label: "prompt-1",
              value: "prompt-1",
            },
            {
              label: "agent-1",
              value: "agent-1",
            },
          ]}
          onValueChange={console.log}
        />
      </FormItem>

      <OpenAIUserMessage />

      <OpenAICustomField />

      <OpenAITrigger />

      <FormItem>
        <FormLabel>Remember Conversation</FormLabel>
        <SingleSelect
          value="yes"
          options={[
            {
              label: "Yes",
              value: "yes",
            },
            {
              label: "No",
              value: "no",
            },
          ]}
          onValueChange={console.log}
        />
      </FormItem>

      <FormItem>
        <FormLabel>Temperature</FormLabel>
        <NumberField value={0.4} max={2} onChange={console.log} />
      </FormItem>

      <FormItem>
        <FormLabel>
          Maximum number of output tokens
          <span className="text-[12px] text-gray-500 pl-1">(Options)</span>
        </FormLabel>
        <NumberField value={250} step={1} max={4096} onChange={console.log} />
      </FormItem>
    </OpenAIDialog>
  );
};
