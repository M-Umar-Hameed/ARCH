import { expect, test } from "vitest";
import { makeGithubConnector } from "../src/sync/connectors/github.js";

test("maps issues, filters PRs, maps comments", async () => {
  const issues = [
    { number: 1, title: "Bug", body: "desc", state: "open", updated_at: "2026-01-01T00:00:00Z" },
    { number: 2, title: "A PR", body: "", state: "open", updated_at: "2026-01-02T00:00:00Z", pull_request: { url: "x" } },
  ];
  const commentsByIssue: Record<number, any[]> = {
    1: [{ id: 55, user: { login: "alice" }, body: "looks off", created_at: "2026-01-01T01:00:00Z" }],
    2: [],
  };
  const octokit: any = {
    issues: { listForRepo: "LIST", listComments: "COMMENTS" },
    paginate: async (fn: string, params: any) =>
      fn === "LIST" ? issues : (commentsByIssue[params.issue_number] ?? []),
  };

  const conn = makeGithubConnector(octokit, "acme/widgets");
  const out = await conn.listExternalTickets();
  expect(conn.source).toBe("github");
  expect(out).toHaveLength(1); // PR filtered
  expect(out[0].externalId).toBe("acme/widgets#1");
  expect(out[0].status).toBe("open");
  expect(out[0].comments[0].externalId).toBe("acme/widgets#comment-55");
  expect(out[0].comments[0].author).toBe("alice");
});
