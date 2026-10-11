// The messages a user has saved, kept free of the SDK so the rules can be
// tested on their own.
import { z } from "zod";

export const messageSchema = z.object({
  id: z.string().min(1),
  /** What the dropdown calls it. */
  name: z.string().trim().min(1, "Give the message a name").max(80),
  /** What is sent to the thread's agent, exactly as a typed message would be. */
  text: z.string().trim().min(1, "Enter the message to send").max(10_000),
});
export type Message = z.infer<typeof messageSchema>;

export const messagesSchema = z
  .array(messageSchema)
  .max(50)
  .refine(
    (messages) => new Set(messages.map((message) => message.id)).size === messages.length,
    "Two messages share an id",
  );

/**
 * What is in storage, read defensively: it is JSON this plugin wrote, but an
 * older version may have written a different shape, and a list we cannot read
 * should come back empty rather than break the header button.
 */
export function parseStoredMessages(stored: unknown): Message[] {
  const parsed = messagesSchema.safeParse(stored ?? []);
  return parsed.success ? parsed.data : [];
}
