import { createHash } from "node:crypto";

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  model: string;
  dim: number;
}

export const MODEL_DIMS: Record<string, number> = {
  "voyage-3": 1024,
  "voyage-3-lite": 512,
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-004": 768,
};

// Deterministic pseudo-embedding for tests: hash-seeded unit-ish vector.
export class FakeEmbedder implements Embedder {
  model = "fake";
  constructor(public dim = 1024) {}
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const h = createHash("sha256").update(t).digest();
      return Array.from({ length: this.dim }, (_, i) => (h[i % h.length] / 255) * 2 - 1);
    });
  }
}

export class VoyageEmbedder implements Embedder {
  dim: number;
  constructor(public model: string, private apiKey: string) {
    const d = MODEL_DIMS[model];
    if (!d) throw new Error(`unknown embed model: ${model}`);
    this.dim = d;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: texts, model: this.model }),
    });
    if (!res.ok) throw new Error(`voyage embed failed: ${res.status}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}

export function getEmbedder(): Embedder {
  const provider = process.env.EMBED_PROVIDER ?? "voyage";
  if (provider === "fake") return new FakeEmbedder(1024);
  const model = process.env.EMBED_MODEL ?? "voyage-3";
  if (!MODEL_DIMS[model]) throw new Error(`unknown embed model: ${model}`);
  if (provider === "voyage") return new VoyageEmbedder(model, process.env.VOYAGE_API_KEY ?? "");
  throw new Error(`unsupported EMBED_PROVIDER: ${provider}`);
}
