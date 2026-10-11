// bb-plugin-send-messages — backend.
//
// Keeps each project's list of saved messages, and sends one to a thread's
// agent the way BB's own composer would: it starts a turn when the agent is
// idle and waits its turn when the agent is busy.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { MESSAGES_CHANGED } from "./channels.js";
import { messagesSchema, parseStoredMessages, type Message } from "./messages.js";

// One list per project: "fix the merge conflicts the way this repo likes" means
// nothing in another.
const messagesKeyFor = (projectId: string) => `messages:${projectId}`;

const projectInput = z.object({ projectId: z.string() });

export const rpcContract = defineRpcContract({
  messages_get: { input: projectInput, output: z.object({ messages: messagesSchema }) },
  messages_save: {
    input: projectInput.extend({ messages: messagesSchema }),
    output: z.object({ messages: messagesSchema }),
  },
  /** Every project, for the Settings page, which BB does not tell which one is in view. */
  projects: {
    input: z.null(),
    output: z.object({ projects: z.array(z.object({ id: z.string(), name: z.string() })) }),
  },
  /**
   * Send a saved message to the thread's agent. `queued` means the agent was
   * busy and BB is holding the message until it is free.
   */
  send: {
    input: z.object({ threadId: z.string(), messageId: z.string() }),
    output: z.object({ delivery: z.enum(["sent", "queued"]) }),
  },
});

export default function plugin(bb: BbPluginApi) {
  async function readMessages(projectId: string): Promise<Message[]> {
    return parseStoredMessages(await bb.storage.kv.get(messagesKeyFor(projectId)));
  }

  bb.rpc.register(rpcContract, {
    messages_get: async ({ projectId }) => ({ messages: await readMessages(projectId) }),

    messages_save: async ({ projectId, messages }) => {
      await bb.storage.kv.set(messagesKeyFor(projectId), messages);
      bb.realtime.publish(MESSAGES_CHANGED, { projectId });
      return { messages };
    },

    projects: async () => ({
      projects: (await bb.sdk.projects.list({})).map(({ id, name }) => ({ id, name })),
    }),

    send: async ({ threadId, messageId }) => {
      const { projectId } = await bb.sdk.threads.get({ threadId });
      const message = (await readMessages(projectId)).find((candidate) => candidate.id === messageId);
      if (message === undefined) throw new Error("That message is no longer in the list.");
      const { delivery } = await bb.sdk.threads.send({
        threadId,
        mode: "auto",
        input: [{ type: "text", text: message.text, mentions: [] }],
      });
      return { delivery };
    },
  });
}
