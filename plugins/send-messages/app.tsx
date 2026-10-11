// bb-plugin-send-messages — frontend.
//
// One button in the thread header. Its dropdown lists the project's saved
// messages; picking one sends it to this thread's agent. The same dropdown
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
import { MESSAGES_CHANGED } from "./channels";
import { messageOf } from "./errors";
import { MessageEditor, ProjectMessageEditor } from "./message-editor";
import type { Message } from "./messages";
import type { rpcContract } from "./server";

const HEADER_LABEL = "Send a message";

// Realtime payloads arrive as untyped JSON; this is the field we filter on.
const messagesChangedSchema = z.object({ projectId: z.string() });

function useMessages(projectId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const refresh = useCallback(() => {
    rpc.call("messages_get", { projectId }).then(
      (result) => setMessages(result.messages),
      (cause) => toast.error(messageOf(cause)),
    );
  }, [rpc, projectId]);
  useEffect(refresh, [refresh]);
  useRealtime(MESSAGES_CHANGED, (payload) => {
    if (messagesChangedSchema.safeParse(payload).data?.projectId === projectId) refresh();
  });
  return { rpc, messages };
}

function HeaderMenu({ threadId, projectId }: { threadId: string; projectId: string }) {
  const { rpc, messages } = useMessages(projectId);
  const [editing, setEditing] = useState(false);

  // A message that is sent shows up in the thread, which is answer enough.
  // One that has to wait does not, so that is the case worth a toast.
  const send = (message: Message) => {
    rpc.call("send", { threadId, messageId: message.id }).then(
      ({ delivery }) => {
        if (delivery === "queued") toast(`"${message.name}" will be sent when the agent is free`);
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
          {messages === null || messages.length === 0 ? (
            <DropdownMenuItem disabled>
              {messages === null ? "Loading messages…" : "No messages yet"}
            </DropdownMenuItem>
          ) : (
            messages.map((message) => (
              <DropdownMenuItem key={message.id} title={message.text} onSelect={() => send(message)}>
                {message.name}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditing(true)}>Edit messages…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Messages</DialogTitle>
            <DialogDescription>
              These are this project's messages. Picking one sends it to the thread's agent, as if
              you had typed it.
            </DialogDescription>
          </DialogHeader>
          <MessageEditor projectId={projectId} onSaved={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "send-messages",
    title: HEADER_LABEL,
    component: ({ threadId, projectId }) => <HeaderMenu threadId={threadId} projectId={projectId} />,
  });

  app.slots.settingsSection({
    id: "messages",
    title: "Messages",
    description: "The messages the Send button offers at the top of each of a project's threads.",
    component: () => <ProjectMessageEditor />,
  });
});
