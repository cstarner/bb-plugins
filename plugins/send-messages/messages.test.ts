import { describe, expect, it } from "vitest";
import { messagesSchema, parseStoredMessages, type Message } from "./messages.js";

const sync: Message = { id: "a", name: "Sync with main", text: "Pull in the latest from main." };

function firstIssue(messages: unknown): string | undefined {
  const parsed = messagesSchema.safeParse(messages);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("messagesSchema", () => {
  it("accepts a message that runs over several lines", () => {
    expect(firstIssue([{ ...sync, text: "Pull in main.\n\nThen fix any conflicts." }])).toBeUndefined();
  });

  it("asks for a name and a message", () => {
    expect(firstIssue([{ ...sync, name: "  " }])).toBe("Give the message a name");
    expect(firstIssue([{ ...sync, text: " \n " }])).toBe("Enter the message to send");
  });

  it("refuses two messages with one id, which the dropdown could not tell apart", () => {
    expect(firstIssue([sync, { ...sync, name: "Again" }])).toBe("Two messages share an id");
  });
});

describe("parseStoredMessages", () => {
  it("reads nothing stored as an empty list", () => {
    expect(parseStoredMessages(undefined)).toEqual([]);
  });

  it("reads a shape it does not recognise as an empty list rather than throwing", () => {
    expect(parseStoredMessages([{ title: "from an older version" }])).toEqual([]);
  });
});
