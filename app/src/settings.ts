import { load } from "@tauri-apps/plugin-store";

export type Settings = { baseUrl: string; apiKey: string };
const FILE = "settings.json";

export async function getSettings(): Promise<Settings> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  const baseUrl = (await store.get<string>("baseUrl")) ?? "http://localhost:8787";
  const apiKey = (await store.get<string>("apiKey")) ?? "";
  return { baseUrl, apiKey };
}

export async function saveSettings(s: Settings): Promise<void> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("baseUrl", s.baseUrl);
  await store.set("apiKey", s.apiKey);
  await store.save();
}
