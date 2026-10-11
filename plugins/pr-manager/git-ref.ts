export function pullRequestSourceRef(number: number): string {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Pull request number must be a positive integer.");
  return `refs/bb/pr-manager/pull/${number}`;
}
// Fetches the pull request's head into the project and names what its thread's worktree
// should be created from: origin's own branch when that is the head, so the worktree's
// branch gets it as upstream, which `git pull` needs and BB finds the pull request by.
// A pull request from a fork, or whose branch has been deleted, has no such branch.
export async function preparePullRequestBase(
  number: number, headRefName: string, git: (...args: string[]) => Promise<string>,
): Promise<{ ref: string; tracksHeadBranch: boolean }> {
  // Keep the PR head outside refs/remotes. BB refreshes and prunes the
  // project's remote-tracking refs before provisioning a worktree.
  const ref = pullRequestSourceRef(number);
  const [originBranch] = await Promise.all([
    git("ls-remote", "origin", `refs/heads/${headRefName}`),
    git("fetch", "--force", "origin", `+refs/pull/${number}/head:${ref}`),
  ]);
  const tracksHeadBranch = originBranch.split("\t")[0] === (await git("rev-parse", ref)).trim();
  // BB fetches origin's branch itself before creating the worktree.
  return { ref: tracksHeadBranch ? `origin/${headRefName}` : ref, tracksHeadBranch };
}
