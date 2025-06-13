const taskConditionsStandard_FixErrors = `
## Task
1. Fix these errors.
## Conditions
2. Output labeled and fully fixed files only, no diffs.
## Standard
3. Respond with the files, no examples or excessive explanations.

~~~console
clean up your errors and put them here
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