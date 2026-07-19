import { pathToFileURL } from "node:url";
import { makeGithubConnector } from "./connectors/github.js";
import { makeGitLabConnector } from "./connectors/gitlab.js";
import { makeJiraConnector } from "./connectors/jira.js";
import { makeAsanaConnector } from "./connectors/asana.js";
import { runSync } from "./import.js";
import { boundProjects } from "../services/projects.js";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  async function runConnector(key: string, factory: (b?: string) => any, legacyProject?: string) {
    const bindings = await boundProjects(key);
    if (bindings.length > 0) {
      for (const { projectId, binding } of bindings) {
        try {
          const result = await runSync(factory(binding), { projectId });
          console.log(JSON.stringify(result));
        } catch (e) {
          console.error(`${key} sync run failed for binding ${binding}:`, (e as Error).message);
          process.exitCode = 1;
        }
      }
    } else if (legacyProject) {
      try {
        const result = await runSync(factory(), { projectId: legacyProject });
        console.log(JSON.stringify(result));
      } catch (e) {
        console.error(`${key.split('.')[0]} sync run failed:`, (e as Error).message);
        process.exit(1);
      }
    }
  }

  await runConnector("github.repo", (b) => makeGithubConnector(undefined, b), process.env.SYNC_GITHUB_PROJECT);
  await runConnector("gitlab.project", (b) => makeGitLabConnector(undefined, b), process.env.SYNC_GITLAB_TARGET_PROJECT);
  await runConnector("jira.project", (b) => makeJiraConnector(undefined, b), process.env.SYNC_JIRA_TARGET_PROJECT);
  await runConnector("asana.projectGid", (b) => makeAsanaConnector(undefined, b), process.env.SYNC_ASANA_TARGET_PROJECT);
}
