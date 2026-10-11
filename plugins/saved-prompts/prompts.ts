// The prompts a user has saved, kept free of the SDK so the rules can be
// tested on their own.
import { z } from "zod";

export const promptSchema = z.object({
  id: z.string().min(1),
  /** What the dropdown calls it. */
  name: z.string().trim().min(1, "Give the prompt a name").max(80),
  /** What is sent to the thread's agent, exactly as a typed message would be. */
  text: z.string().trim().min(1, "Enter the prompt to send").max(10_000),
});
export type Prompt = z.infer<typeof promptSchema>;

export const promptsSchema = z
  .array(promptSchema)
  .max(50)
  .refine(
    (prompts) => new Set(prompts.map((prompt) => prompt.id)).size === prompts.length,
    "Two prompts share an id",
  );

/**
 * What is in storage, read defensively: it is JSON this plugin wrote, but an
 * older version may have written a different shape, and a list we cannot read
 * should come back empty rather than break the header button.
 */
export function parseStoredPrompts(stored: unknown): Prompt[] {
  const parsed = promptsSchema.safeParse(stored ?? []);
  return parsed.success ? parsed.data : [];
}
