import { describe, expect, it } from "vitest";
import { promptsSchema, parseStoredPrompts, type Prompt } from "./prompts.js";

const sync: Prompt = { id: "a", name: "Sync with main", text: "Pull in the latest from main." };

function firstIssue(prompts: unknown): string | undefined {
  const parsed = promptsSchema.safeParse(prompts);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("promptsSchema", () => {
  it("accepts a prompt that runs over several lines", () => {
    expect(firstIssue([{ ...sync, text: "Pull in main.\n\nThen fix any conflicts." }])).toBeUndefined();
  });

  it("asks for a name and a prompt", () => {
    expect(firstIssue([{ ...sync, name: "  " }])).toBe("Give the prompt a name");
    expect(firstIssue([{ ...sync, text: " \n " }])).toBe("Enter the prompt to send");
  });

  it("refuses two prompts with one id, which the dropdown could not tell apart", () => {
    expect(firstIssue([sync, { ...sync, name: "Again" }])).toBe("Two prompts share an id");
  });
});

describe("parseStoredPrompts", () => {
  it("reads nothing stored as an empty list", () => {
    expect(parseStoredPrompts(undefined)).toEqual([]);
  });

  it("reads a shape it does not recognise as an empty list rather than throwing", () => {
    expect(parseStoredPrompts([{ title: "from an older version" }])).toEqual([]);
  });
});
