import { getSetting } from "../services/settings.js";

const MAX_TEXT_LENGTH = 20_000;

export async function fetchDocs(library: string, topic?: string): Promise<{ ok: boolean; text: string }> {
  const enabled = await getSetting("context7.enabled");
  if (enabled !== "true") {
    return { ok: false, text: "Context7 is disabled; enable it in settings (context7.enabled)." };
  }

  const apiKey = await getSetting("context7.apiKey");
  const authHeaders: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  try {
    const searchRes = await fetch(`https://context7.com/api/v1/search?query=${encodeURIComponent(library)}`, {
      headers: { Accept: "application/json", ...authHeaders },
    });
    if (!searchRes.ok) {
      return { ok: false, text: `Context7 request failed: ${searchRes.status}` };
    }
    const results = (await searchRes.json()) as Array<{ id: string }>;
    const id = results[0]?.id;
    if (!id) {
      return { ok: false, text: `Context7 request failed: no results for ${library}` };
    }

    const params = new URLSearchParams({ tokens: "2500" });
    if (topic) params.set("topic", topic);
    const docsRes = await fetch(`https://context7.com/api/v1/${id}?${params.toString()}`, {
      headers: authHeaders,
    });
    if (!docsRes.ok) {
      return { ok: false, text: `Context7 request failed: ${docsRes.status}` };
    }
    const text = await docsRes.text();
    return { ok: true, text: text.slice(0, MAX_TEXT_LENGTH) };
  } catch (e) {
    return { ok: false, text: `Context7 request failed: ${(e as Error).message}` };
  }
}
