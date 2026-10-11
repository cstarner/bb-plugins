import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES_CHANGED } from "./channels.js";
import type { Message } from "./messages.js";
import plugin from "./server.js";

const THREAD = "thr_1";
const PROJECT = "proj_1";

const sync: Message = {
  id: "sync",
  name: "Sync with main",
  text: "Pull in the latest from main and fix any merge conflicts.",
};

async function createHost(messages: Message[] = [sync]) {
  const send = vi.fn(async (_args: unknown) => ({ ok: true, delivery: "sent" }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "send-messages",
    sdk: {
      threads: { get: vi.fn(async () => ({ projectId: PROJECT })), send },
      projects: {
        list: vi.fn(async () => [
          { id: PROJECT, name: "app", path: "/repos/app" },
          { id: "proj_2", name: "site", path: "/repos/site" },
        ]),
      },
    },
  });
  plugin(bb);
  await harness.behavior.callRpc("messages_save", { projectId: PROJECT, messages });
  return { harness, send };
}

describe("sending a message", () => {
  it("sends the saved text to the thread, as a message the agent takes when it can", async () => {
    const { harness, send } = await createHost();
    await expect(
      harness.behavior.callRpc("send", { threadId: THREAD, messageId: "sync" }),
    ).resolves.toEqual({ delivery: "sent" });
    expect(send).toHaveBeenCalledWith({
      threadId: THREAD,
      mode: "auto",
      input: [{ type: "text", text: sync.text, mentions: [] }],
    });
  });

  it("says so when the agent was busy and the message is waiting", async () => {
    const { harness, send } = await createHost();
    send.mockResolvedValueOnce({ ok: true, delivery: "queued" });
    await expect(
      harness.behavior.callRpc("send", { threadId: THREAD, messageId: "sync" }),
    ).resolves.toEqual({ delivery: "queued" });
  });

  it("refuses a message that has since been removed, and sends nothing", async () => {
    const { harness, send } = await createHost();
    await expect(
      harness.behavior.callRpc("send", { threadId: THREAD, messageId: "gone" }),
    ).rejects.toThrow("That message is no longer in the list.");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the list of messages", () => {
  it("is saved for its project, and tells that project's open headers to refetch", async () => {
    const { harness } = await createHost();
    await expect(harness.behavior.callRpc("messages_get", { projectId: PROJECT })).resolves.toEqual({
      messages: [sync],
    });
    expect(harness.realtimeSignals).toContainEqual({
      channel: MESSAGES_CHANGED,
      payload: { projectId: PROJECT },
    });
  });

  it("belongs to one project: another project starts with none", async () => {
    const { harness } = await createHost();
    await expect(harness.behavior.callRpc("messages_get", { projectId: "proj_2" })).resolves.toEqual({
      messages: [],
    });
  });

  it("offers every project to the Settings page, by id and name only", async () => {
    const { harness } = await createHost();
    await expect(harness.behavior.callRpc("projects", null)).resolves.toEqual({
      projects: [
        { id: PROJECT, name: "app" },
        { id: "proj_2", name: "site" },
      ],
    });
  });
});
