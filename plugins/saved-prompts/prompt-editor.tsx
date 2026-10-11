// The form for one project's list of saved prompts. Shown in two places —
// the dialog the header dropdown opens, and the plugin's page in Settings — so
// it owns its own loading and saving rather than being handed a list.
import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { messageOf } from "./errors";
import { promptsSchema, type Prompt } from "./prompts";
import type { rpcContract } from "./server";

function blankPrompt(): Prompt {
  return { id: crypto.randomUUID(), name: "", text: "" };
}

function PromptFields({
  prompt,
  onChange,
  onRemove,
}: {
  prompt: Prompt;
  onChange: (next: Prompt) => void;
  onRemove: () => void;
}) {
  const label = prompt.name.trim() === "" ? "new prompt" : `"${prompt.name}"`;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <Input
          value={prompt.name}
          onChange={(event) => onChange({ ...prompt, name: event.target.value })}
          placeholder="Name, e.g. Sync with main"
          aria-label={`Name of ${label}`}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <Icon name="Trash2" className="size-4" />
        </Button>
      </div>
      <Textarea
        value={prompt.text}
        onChange={(event) => onChange({ ...prompt, text: event.target.value })}
        placeholder="Prompt, e.g. Pull in the latest from main and fix any merge conflicts."
        aria-label={`Prompt for ${label}`}
        rows={3}
      />
    </li>
  );
}

/**
 * Edits one project's prompts. `onSaved` lets the dialog close itself; the
 * Settings page leaves it out.
 */
export function PromptEditor({ projectId, onSaved }: { projectId: string; onSaved?: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const [draft, setDraft] = useState<Prompt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    rpc.call("prompts_get", { projectId }).then(
      (result) => setDraft(result.prompts),
      (cause) => setError(messageOf(cause)),
    );
  }, [rpc, projectId]);
  useEffect(load, [load]);

  const save = async () => {
    const parsed = promptsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "These prompts are not valid.");
      return;
    }
    setSaving(true);
    try {
      const saved = await rpc.call("prompts_save", { projectId, prompts: parsed.data });
      setDraft(saved.prompts);
      setError(null);
      onSaved?.();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };

  if (draft === null) {
    return (
      <p role={error === null ? "status" : "alert"} className="text-sm text-muted-foreground">
        {error ?? "Loading prompts…"}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No prompts yet. Add one, such as an instruction you find yourself typing in every thread.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {draft.map((prompt) => (
            <PromptFields
              key={prompt.id}
              prompt={prompt}
              onChange={(next) =>
                setDraft(draft.map((entry) => (entry.id === prompt.id ? next : entry)))
              }
              onRemove={() => setDraft(draft.filter((entry) => entry.id !== prompt.id))}
            />
          ))}
        </ul>
      )}
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setDraft([...draft, blankPrompt()])}>
          <Icon name="Plus" className="size-4" />
          Add prompt
        </Button>
        <Button size="sm" disabled={saving} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

/**
 * The Settings page's editor. BB does not tell a settings section which
 * project is in view, so this one asks: pick a project, then edit its list.
 */
export function ProjectPromptEditor() {
  const rpc = useRpc<typeof rpcContract>();
  const [projects, setProjects] = useState<{ id: string; name: string }[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc.call("projects", null).then(
      (result) => {
        setProjects(result.projects);
        setProjectId((chosen) => chosen ?? result.projects[0]?.id ?? null);
      },
      (cause) => setError(messageOf(cause)),
    );
  }, [rpc]);

  if (projects === null) {
    return (
      <p role={error === null ? "status" : "alert"} className="text-sm text-muted-foreground">
        {error ?? "Loading projects…"}
      </p>
    );
  }
  if (projectId === null) {
    return <p className="text-sm text-muted-foreground">Add a project to give it prompts.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        Project
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      {/* Keyed so switching project discards the other project's unsaved draft. */}
      <PromptEditor key={projectId} projectId={projectId} />
    </div>
  );
}
