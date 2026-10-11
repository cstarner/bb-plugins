// The realtime channel server.ts publishes on and the frontend listens on to
// know its copy is stale. Kept free of the SDK so the frontend bundle can
// import the name without pulling the backend in with it.

/** Payload `{ projectId }`: that project's list of messages was edited. */
export const MESSAGES_CHANGED = "messages-changed";
