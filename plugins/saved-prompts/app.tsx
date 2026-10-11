// bb-plugin-saved-prompts — frontend.
//
// One button in the thread header. Its dropdown lists the project's saved
// prompts; picking one sends it to this thread's agent. The same dropdown
// opens the editor for the list, which also sits on the plugin's page in
// Settings.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PROMPTS_CHANGED } from "./channels";
import { messageOf } from "./errors";
import { PromptEditor, ProjectPromptEditor } from "./prompt-editor";
import type { Prompt } from "./prompts";
import type { rpcContract } from "./server";

const HEADER_LABEL = "Send a prompt";

// Realtime payloads arrive as untyped JSON; this is the field we filter on.
const promptsChangedSchema = z.object({ projectId: z.string() });

function usePrompts(projectId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const refresh = useCallback(() => {
    rpc.call("prompts_get", { projectId }).then(
      (result) => setPrompts(result.prompts),
      (cause) => toast.error(messageOf(cause)),
    );
  }, [rpc, projectId]);
  useEffect(refresh, [refresh]);
  useRealtime(PROMPTS_CHANGED, (payload) => {
    if (promptsChangedSchema.safeParse(payload).data?.projectId === projectId) refresh();
  });
  return { rpc, prompts };
}

function HeaderMenu({ threadId, projectId }: { threadId: string; projectId: string }) {
  const { rpc, prompts } = usePrompts(projectId);
  const [editing, setEditing] = useState(false);

  // A prompt that is sent shows up in the thread, which is answer enough.
  // One that has to wait does not, so that is the case worth a toast.
  const send = (prompt: Prompt) => {
    rpc.call("send", { threadId, promptId: prompt.id }).then(
      ({ delivery }) => {
        if (delivery === "queued") toast(`"${prompt.name}" will be sent when the agent is free`);
      },
      (cause) => toast.error(messageOf(cause)),
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={HEADER_LABEL}
          >
            <Icon name="Send" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {prompts === null || prompts.length === 0 ? (
            <DropdownMenuItem disabled>
              {prompts === null ? "Loading prompts…" : "No prompts yet"}
            </DropdownMenuItem>
          ) : (
            prompts.map((prompt) => (
              <DropdownMenuItem key={prompt.id} title={prompt.text} onSelect={() => send(prompt)}>
                {prompt.name}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditing(true)}>Edit prompts…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prompts</DialogTitle>
            <DialogDescription>
              These are this project's prompts. Picking one sends it to the thread's agent, as if
              you had typed it.
            </DialogDescription>
          </DialogHeader>
          <PromptEditor projectId={projectId} onSaved={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "saved-prompts",
    title: HEADER_LABEL,
    component: ({ threadId, projectId }) => <HeaderMenu threadId={threadId} projectId={projectId} />,
  });

  app.slots.settingsSection({
    id: "prompts",
    title: "Prompts",
    description: "The prompts the Send button offers at the top of each of a project's threads.",
    component: () => <ProjectPromptEditor />,
  });
});
