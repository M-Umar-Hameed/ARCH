import { getSetting } from "../../services/settings.js";
import type { SourceConnector, ExternalTicket, ExternalComment } from "../connector.js";

function flattenAdf(doc: any): string {
  if (!doc?.content) return "";
  function walkText(node: any): string {
    if (node.type === "text") return node.text ?? "";
    if (!node.content) return "";
    return node.content.map(walkText).join("");
  }
  return doc.content.map(walkText).filter(Boolean).join("\n");
}

export function makeJiraConnector(fetchImpl: typeof fetch = fetch): SourceConnector {
  async function searchIssues(urlStr: string, headers: Record<string, string>): Promise<any[]> {
    const results: any[] = [];
    let startAt: number = 0;
    let pages: number = 0;
    while (pages < 10) {
      const url = new URL(urlStr);
      url.searchParams.set("startAt", startAt.toString());
      url.searchParams.set("maxResults", "50");

      const res = await fetchImpl(url.toString(), { headers });
      if (!res.ok) {
        throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      results.push(...data.issues);
      pages++;
      startAt += data.issues.length;
      if (startAt >= data.total || data.issues.length === 0) break;
    }
    return results;
  }

  return {
    source: "jira",
    async listExternalTickets(since?: Date): Promise<ExternalTicket[]> {
      const baseUrl = await getSetting("jira.baseUrl");
      const email = await getSetting("jira.email");
      const apiToken = await getSetting("jira.apiToken");
      const project = await getSetting("jira.project");

      if (!baseUrl || !email || !apiToken || !project) {
        console.warn("Jira connector skipped: missing jira.baseUrl, jira.email, jira.apiToken, or jira.project setting");
        return [];
      }

      const headers = {
        "Authorization": `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        "Accept": "application/json"
      };

      const cursorStr = since?.toISOString().slice(0, 16).replace("T", " ");
      const jql = `project=${project}` + (since ? ` AND updated>="${cursorStr}"` : "") + ` ORDER BY updated ASC`;

      const searchUrl = new URL(`${baseUrl}/rest/api/3/search`);
      searchUrl.searchParams.set("jql", jql);

      const issues = await searchIssues(searchUrl.toString(), headers);
      const out: ExternalTicket[] = [];

      for (const issue of issues) {
        const commentsUrl = new URL(`${baseUrl}/rest/api/3/issue/${issue.key}/comment`);
        commentsUrl.searchParams.set("orderBy", "created");
        commentsUrl.searchParams.set("maxResults", "50");

        const commentsRes = await fetchImpl(commentsUrl.toString(), { headers });
        if (!commentsRes.ok) {
          throw new Error(`Jira API error: ${commentsRes.status} ${commentsRes.statusText}`);
        }
        const commentsData = await commentsRes.json();

        const comments: ExternalComment[] = (commentsData.comments || []).map((c: any) => ({
          externalId: `jira:${issue.key}:comment:${c.id}`,
          author: c.author?.displayName ?? "unknown",
          body: flattenAdf(c.body),
          createdAt: c.created,
        }));

        out.push({
          externalId: `jira:${project}:${issue.key}`,
          title: issue.fields.summary,
          body: flattenAdf(issue.fields.description),
          status: issue.fields.status?.statusCategory?.key === "done" ? "closed" : "open",
          updatedAt: issue.fields.updated,
          comments,
        });
      }

      return out;
    },
  };
}
