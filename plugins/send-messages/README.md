# Send Messages

A button in the thread header that sends one of your saved messages — such as
"Pull in the latest from main and fix any merge conflicts" — to the thread's
agent. Lighter than a skill: a message is just a name and some text, and it is
yours rather than the repository's.

## Surfaces

- **Thread header button** ("Send a message") — a dropdown of the project's
  saved messages, then "Edit messages…". Picking a message sends it.
- **Settings section** ("Messages") on the plugin's page in Settings — the same
  editor the dropdown opens, behind a project picker, because BB does not tell
  a settings page which project is in view.

## A saved message

| Field | Meaning |
| --- | --- |
| Name | What the dropdown calls it. |
| Message | The text sent to the agent. It can run over several lines. |

## Behavior worth knowing

- **Picking a message sends it at once.** There is no confirmation and nothing
  is put in the composer; whatever you were typing there is left alone.
- **A busy agent gets it when it is free.** The message is sent with BB's
  `auto` mode: it starts a turn on an idle thread and is held for a running
  one. When it is held, a toast says so; when it is sent, it appears in the
  thread and nothing else is shown.
- **The text is sent as written.** It is plain text, with no placeholders and
  no @-mentions.
- **Each project has its own list.** A thread offers the messages of the
  project it belongs to. The lists live in the plugin's own storage, not in
  any repository.

## Development

```sh
npm install --include=dev   # once
npm test                    # vitest: message rules, backend RPC, frontend slots
npm run typecheck
bb plugin install .
bb plugin dev               # rebuild + reload on save
```
