// bb-plugin-saved-prompts — backend.
//
// Keeps each project's list of saved prompts, and sends one to a thread's
// agent the way BB's own composer would: it starts a turn when the agent is
// idle and waits its turn when the agent is busy.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { PROMPTS_CHANGED } from "./channels.js";
import { promptsSchema, parseStoredPrompts, type Prompt } from "./prompts.js";

// One list per project: "fix the merge conflicts the way this repo likes" means
// nothing in another.
const promptsKeyFor = (projectId: string) => `prompts:${projectId}`;

const projectInput = z.object({ projectId: z.string() });

export const rpcContract = defineRpcContract({
  prompts_get: { input: projectInput, output: z.object({ prompts: promptsSchema }) },
  prompts_save: {
    input: projectInput.extend({ prompts: promptsSchema }),
    output: z.object({ prompts: promptsSchema }),
  },
  /** Every project, for the Settings page, which BB does not tell which one is in view. */
  projects: {
    input: z.null(),
    output: z.object({ projects: z.array(z.object({ id: z.string(), name: z.string() })) }),
  },
  /**
   * Send a saved prompt to the thread's agent. `queued` means the agent was
   * busy and BB is holding the prompt until it is free.
   */
  send: {
    input: z.object({ threadId: z.string(), promptId: z.string() }),
    output: z.object({ delivery: z.enum(["sent", "queued"]) }),
  },
});

export default function plugin(bb: BbPluginApi) {
  async function readPrompts(projectId: string): Promise<Prompt[]> {
    return parseStoredPrompts(await bb.storage.kv.get(promptsKeyFor(projectId)));
  }

  bb.rpc.register(rpcContract, {
    prompts_get: async ({ projectId }) => ({ prompts: await readPrompts(projectId) }),

    prompts_save: async ({ projectId, prompts }) => {
      await bb.storage.kv.set(promptsKeyFor(projectId), prompts);
      bb.realtime.publish(PROMPTS_CHANGED, { projectId });
      return { prompts };
    },

    projects: async () => ({
      projects: (await bb.sdk.projects.list({})).map(({ id, name }) => ({ id, name })),
    }),

    send: async ({ threadId, promptId }) => {
      const { projectId } = await bb.sdk.threads.get({ threadId });
      const prompt = (await readPrompts(projectId)).find((candidate) => candidate.id === promptId);
      if (prompt === undefined) throw new Error("That prompt is no longer in the list.");
      const { delivery } = await bb.sdk.threads.send({
        threadId,
        mode: "auto",
        input: [{ type: "text", text: prompt.text, mentions: [] }],
      });
      return { delivery };
    },
  });
}
