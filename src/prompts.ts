const taskConditionsStandard_FixErrors = `
TASK: Fix these errors.
CONDITIONS: Output labeled and fully fixed files only, no diffs.
STANDARD: Respond with the files, no examples or excessive explanations.

~~~console

~~~
`;


export const customPrompts: Record<string, string> = {
  "tcs:fix:errors": taskConditionsStandard_FixErrors,
};

export type PresetPrompt = keyof typeof customPrompts;


export function isPreset(key: string): boolean {
  return key in customPrompts;
}


export const prompts = {
  ...customPrompts,
  default: customPrompts["tcs:fix:errors"],
  getPrompt(key?: string) {
    if (!key) return prompts.default;
    if (!isPreset(key)) return prompts.default;
    return customPrompts[key];
  }
};