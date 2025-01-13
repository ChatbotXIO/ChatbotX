"use client";

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog";

import { SingleSelect } from "@/components/single-select";

import { FormItem, FormLabel } from "@/components/ui/form";
import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field";
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/components/model";
import { OpenAIUserMessage } from "@/features/flows/react-flow/blocks/open-ai/components/user-message";

interface OpenAIGenerateImageEditorProps {
  parentName: string;
}

export const OpenAIGenerateImageEditor = ({
  parentName,
}: OpenAIGenerateImageEditorProps) => {
  return (
    <OpenAIDialog name="flows.OpenAI.Title.GenerateImage">
      <OpenAIModel onValueChange={console.log} />

      <OpenAIUserMessage />

      <FormItem>
        <FormLabel>Size</FormLabel>
        <SingleSelect
          value="1024_1024_dall_e_2"
          options={[
            { value: "256_256_dall_e_2", label: "256x256 (DALL·E 2)" },
            { value: "512_512_dall_e_2", label: "512x512 (DALL·E 2)" },
            { value: "1024_1024_dall_e_2", label: "1024x1024 (DALL·E 2)" },
            { value: "1024_1024_dall_e_3", label: "1024x1024 (DALL·E 3)" },
            { value: "1792_1024_dall_e_3", label: "1792x1024 (DALL·E 3)" },
            { value: "1024_1792_dall_e_3", label: "1024x1792 (DALL·E 3)" },
          ]}
          onValueChange={console.log}
        />
      </FormItem>

      <OpenAICustomField />
    </OpenAIDialog>
  );
};
