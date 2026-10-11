// The realtime channels server.ts publishes on and the frontend listens on to
// know its copy is stale. Kept free of the SDK so the frontend bundle can
// import the names without pulling the backend in with them.

/** Payload `{ projectId }`: that project's list of commands was edited. */
export const PRESETS_CHANGED = "presets-changed";
/** Payload `{ threadId }`: a run was added, removed, or changed status. */
export const RUNS_CHANGED = "runs-changed";
/** Payload `{ threadId, runId }`: a run printed more. */
export const OUTPUT_ADDED = "output-added";
