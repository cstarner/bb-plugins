import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract.js";
import { preparePullRequestBase, renameToPullRequestBranch } from "./git-ref.js";
import { fetchPullRequests } from "./pr-search.js";
import { sortPullRequests } from "./pr-list.js";

const execFileAsync = promisify(execFile);
async function run(command: string, args: string[], signal: AbortSignal): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 60_000, signal });
    return stdout;
  } catch (cause) {
    const error = cause as Error & { stderr?: string };
    throw new Error(`${command} failed: ${error.stderr?.trim() || error.message}`);
  }
}
function normalizeRemote(remote: string): string | null {
  const cleaned = remote.trim().replace(/\.git$/, "").replace(/^ssh:\/\//, "");
  return cleaned.match(/(?:git@|https?:\/\/)?github\.com[:/]([^/]+\/[^/]+)$/i)?.[1]?.toLowerCase() ?? null;
}
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async listPullRequests({ repository, mergedWithinDays, maximumMergedPullRequests, savedPullRequests }, context) {
      const since = new Date(Date.now() - mergedWithinDays * 86_400_000).toISOString().slice(0, 10);
      // The sign-in check runs alongside the fetch rather than ahead of it. When it fails
      // the fetch fails too, and its error is the one that says how to sign in.
      const [signedIn, fetched] = await Promise.allSettled([
        run("gh", ["auth", "status"], context.signal),
        fetchPullRequests({ repository, since, maximumMergedPullRequests, savedPullRequests }, (args) => run("gh", args, context.signal)),
      ]);
      if (signedIn.status === "rejected") throw signedIn.reason;
      if (fetched.status === "rejected") throw fetched.reason;
      const pullRequests = fetched.value;
      return { pullRequests: sortPullRequests(pullRequests, "STATUS") };
    },
    async preparePullRequestBranch({ projectPath, repository, number, headRefName }, context) {
      const git = (...args: string[]) => run("git", ["-C", projectPath, ...args], context.signal);
      if (normalizeRemote(await git("remote", "get-url", "origin")) !== repository.toLowerCase()) throw new Error(`Project origin does not match ${repository}.`);
      return preparePullRequestBase(number, headRefName, git);
    },
    async renameBranchToPullRequestHead({ worktreePath, createdBranch, headRefName }, context) {
      await renameToPullRequestBranch(createdBranch, headRefName, (...args) => run("git", ["-C", worktreePath, ...args], context.signal));
      return null;
    },
  },
});
