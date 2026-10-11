// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "./messages.js";

// The header menu's answers are toasts, so the toasts are the assertion —
// sonner is stubbed rather than rendered.
const toasts = { plain: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => {
  const toast = Object.assign((text: string) => toasts.plain(text), {
    error: (text: string) => toasts.error(text),
  });
  return { toast };
});

beforeEach(() => {
  toasts.plain.mockClear();
  toasts.error.mockClear();
});

const THREAD = "thr_1";
const PROJECT = "proj_1";
const sync: Message = {
  id: "sync",
  name: "Sync with main",
  text: "Pull in the latest from main and fix any merge conflicts.",
};

async function loadApp() {
  return await loadPluginApp(() => import("./app"));
}

// renderSlot mounts into document.body; without this every later query sees
// the previous test's markup too.
let mounted: { lifecycle: { unmount: () => void } } | null = null;
afterEach(() => {
  mounted?.lifecycle.unmount();
  mounted = null;
});

type Rpc = Record<string, (input: unknown) => unknown>;

async function renderHeader(rpc: Rpc) {
  const app = await loadApp();
  const registration = app.threadHeaderActions.find((entry) => entry.id === "send-messages")!;
  const slot = renderSlot(
    registration,
    { threadId: THREAD, projectId: PROJECT, isCompactViewport: false },
    { rpc },
  );
  mounted = slot;
  return slot;
}

const projects = () => ({
  projects: [
    { id: PROJECT, name: "app" },
    { id: "proj_2", name: "site" },
  ],
});

async function renderSettings(rpc: Rpc) {
  const app = await loadApp();
  const registration = app.settingsSections.find((entry) => entry.id === "messages")!;
  const slot = renderSlot(registration, {}, { rpc: { projects, ...rpc } });
  mounted = slot;
  return slot;
}

/** Radix opens its menus on pointer-down and keyboard, not on a synthetic click. */
async function openMenu(slot: Awaited<ReturnType<typeof renderHeader>>) {
  const trigger = await slot.findByLabelText("Send a message");
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("the header menu", () => {
  it("sends the message that is picked, to this thread, without a toast", async () => {
    const send = vi.fn(() => ({ delivery: "sent" }));
    const slot = await renderHeader({ messages_get: () => ({ messages: [sync] }), send });
    await openMenu(slot);
    fireEvent.click(await slot.findByText("Sync with main"));
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith({ threadId: THREAD, messageId: "sync" }),
    );
    expect(toasts.plain).not.toHaveBeenCalled();
  });

  it("says so when the agent is busy and the message has to wait", async () => {
    const slot = await renderHeader({
      messages_get: () => ({ messages: [sync] }),
      send: () => ({ delivery: "queued" }),
    });
    await openMenu(slot);
    fireEvent.click(await slot.findByText("Sync with main"));
    await vi.waitFor(() =>
      expect(toasts.plain).toHaveBeenCalledWith(
        '"Sync with main" will be sent when the agent is free',
      ),
    );
  });

  it("surfaces a rejected send as an error toast rather than silence", async () => {
    const slot = await renderHeader({
      messages_get: () => ({ messages: [sync] }),
      send: () => {
        throw new Error("That message is no longer in the list.");
      },
    });
    await openMenu(slot);
    fireEvent.click(await slot.findByText("Sync with main"));
    await vi.waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("That message is no longer in the list."),
    );
  });

  it("points at the editor when there are no messages yet", async () => {
    const slot = await renderHeader({ messages_get: () => ({ messages: [] }) });
    await openMenu(slot);
    expect(await slot.findByText("No messages yet")).toBeTruthy();
    expect(await slot.findByText("Edit messages…")).toBeTruthy();
  });

  it("asks for this project's messages, and refetches when they are edited elsewhere", async () => {
    const messages_get = vi.fn(() => ({ messages: [sync] }));
    const slot = await renderHeader({ messages_get });
    await vi.waitFor(() => expect(messages_get).toHaveBeenCalledWith({ projectId: PROJECT }));
    await slot.behavior.emitRealtime("messages-changed", { projectId: "proj_2" });
    await slot.behavior.emitRealtime("messages-changed", { projectId: PROJECT });
    await vi.waitFor(() => expect(messages_get).toHaveBeenCalledTimes(2));
  });
});

describe("the message editor", () => {
  it("saves a message that was added", async () => {
    const save = vi.fn((input: unknown) => input);
    const slot = await renderSettings({ messages_get: () => ({ messages: [] }), messages_save: save });
    fireEvent.click(await slot.findByText("Add message"));
    fireEvent.change(slot.getByLabelText("Name of new message"), {
      target: { value: "Sync with main" },
    });
    fireEvent.change(slot.getByLabelText('Message for "Sync with main"'), {
      target: { value: sync.text },
    });
    fireEvent.click(slot.getByText("Save"));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        projectId: PROJECT,
        messages: [{ id: expect.any(String), name: "Sync with main", text: sync.text }],
      }),
    );
  });

  it("says what is wrong instead of saving a message with nothing to send", async () => {
    const save = vi.fn((input: unknown) => input);
    const slot = await renderSettings({
      messages_get: () => ({ messages: [{ ...sync, text: "" }] }),
      messages_save: save,
    });
    fireEvent.click(await slot.findByText("Save"));
    expect(await slot.findByText("Enter the message to send")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("removes a message", async () => {
    const save = vi.fn((input: unknown) => input);
    const slot = await renderSettings({ messages_get: () => ({ messages: [sync] }), messages_save: save });
    fireEvent.click(await slot.findByLabelText('Remove "Sync with main"'));
    fireEvent.click(slot.getByText("Save"));
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ projectId: PROJECT, messages: [] }));
  });

  it("edits the messages of whichever project is picked", async () => {
    const messages_get = vi.fn(() => ({ messages: [] }));
    const slot = await renderSettings({ messages_get });
    fireEvent.change(await slot.findByLabelText("Project"), { target: { value: "proj_2" } });
    await vi.waitFor(() => expect(messages_get).toHaveBeenLastCalledWith({ projectId: "proj_2" }));
  });
});
