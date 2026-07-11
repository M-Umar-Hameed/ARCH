import type { Octokit } from "@octokit/rest";
import type { SourceConnector, ExternalTicket } from "../connector.js";

export function makeGithubConnector(octokit: Octokit, repo: string): SourceConnector {
  const [owner, name] = repo.split("/");
  return {
    source: "github",
    async listExternalTickets(since?: Date): Promise<ExternalTicket[]> {
      const issues = await octokit.paginate(octokit.issues.listForRepo, {
        owner, repo: name, state: "all", since: since?.toISOString(), per_page: 100,
      } as never);
      const out: ExternalTicket[] = [];
      for (const issue of issues as any[]) {
        if (issue.pull_request) continue; // the issues endpoint returns PRs too
        const comments = await octokit.paginate(octokit.issues.listComments, {
          owner, repo: name, issue_number: issue.number, per_page: 100,
        } as never);
        out.push({
          externalId: `${repo}#${issue.number}`,
          title: issue.title,
          body: issue.body ?? "",
          status: issue.state === "closed" ? "closed" : "open",
          updatedAt: issue.updated_at,
          comments: (comments as any[]).map((c) => ({
            externalId: `${repo}#comment-${c.id}`,
            author: c.user?.login ?? "unknown",
            body: c.body ?? "",
            createdAt: c.created_at,
          })),
        });
      }
      return out;
    },
  };
}
