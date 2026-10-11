import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { preparePullRequestBase, pullRequestSourceRef } from "./git-ref.js";

const execFileAsync = promisify(execFile);

describe("pullRequestSourceRef", () => {
  it("uses a private ref that remote pruning cannot remove", () => {
    expect(pullRequestSourceRef(5622)).toBe("refs/bb/pr-manager/pull/5622");
    expect(pullRequestSourceRef(5622)).not.toContain("refs/remotes/");
  });

  it("rejects invalid pull request numbers", () => {
    expect(() => pullRequestSourceRef(0)).toThrow("positive integer");
    expect(() => pullRequestSourceRef(1.5)).toThrow("positive integer");
  });
});

describe("preparePullRequestBase", () => {
  // A project cloned from an origin holding pull request 1, whose head is `feature`.
  async function projectWithPullRequest() {
    const root = await mkdtemp(join(tmpdir(), "pr-manager-"));
    const git = (cwd: string) => async (...args: string[]) => (await execFileAsync("git", ["-C", cwd, ...args])).stdout;
    const origin = join(root, "origin.git"), seed = join(root, "seed"), project = join(root, "project");
    await execFileAsync("git", ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
    await execFileAsync("git", ["clone", "--quiet", origin, seed]);
    const commit = ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "--allow-empty", "-m"];
    await git(seed)("checkout", "--quiet", "-b", "main");
    await git(seed)(...commit, "base");
    await git(seed)("checkout", "--quiet", "-b", "feature");
    await git(seed)(...commit, "change");
    await git(seed)("push", "--quiet", "origin", "main", "feature", "feature:refs/pull/1/head");
    await execFileAsync("git", ["clone", "--quiet", origin, project]);
    return { root, origin: git(origin), project: git(project) };
  }

  it("bases the worktree on origin's branch, which then pulls and, once renamed, pushes", async () => {
    const { root, project } = await projectWithPullRequest();
    const base = await preparePullRequestBase(1, "feature", project);
    expect(base).toEqual({ ref: "origin/feature", tracksHeadBranch: true });
    const worktree = join(root, "worktree");
    await project("worktree", "add", "--quiet", "-B", "bb/pr-1-thread", worktree, base.ref);
    const inWorktree = (...args: string[]) => project("-C", worktree, ...args);
    expect((await inWorktree("rev-parse", "--abbrev-ref", "@{upstream}")).trim()).toBe("origin/feature");
    await inWorktree("pull", "--quiet");
    await expect(inWorktree("push", "--dry-run")).rejects.toThrow("does not match");
    await inWorktree("branch", "-m", "bb/pr-1-thread", "feature");
    await inWorktree("push", "--dry-run");
  });

  it("falls back to the private ref when origin's branch is gone or is not the head", async () => {
    const { origin, project } = await projectWithPullRequest();
    await origin("update-ref", "refs/heads/feature", "refs/heads/main");
    expect(await preparePullRequestBase(1, "feature", project)).toEqual({ ref: "refs/bb/pr-manager/pull/1", tracksHeadBranch: false });
    await origin("update-ref", "-d", "refs/heads/feature");
    expect(await preparePullRequestBase(1, "feature", project)).toEqual({ ref: "refs/bb/pr-manager/pull/1", tracksHeadBranch: false });
    expect(await project("rev-parse", "refs/bb/pr-manager/pull/1")).toBe(await origin("rev-parse", "refs/pull/1/head"));
  });
});
