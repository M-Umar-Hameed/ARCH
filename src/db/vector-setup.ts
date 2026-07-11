import { sql as dsql } from "drizzle-orm";
import { db } from "./client.js";

export async function ensureExtension(): Promise<void> {
  await db.execute(dsql`CREATE EXTENSION IF NOT EXISTS vector`);
}

export async function ensureIndex(): Promise<void> {
  try {
    await db.execute(dsql`CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
      ON embeddings USING hnsw (embedding vector_cosine_ops)`);
  } catch (e) {
    console.warn("hnsw index unavailable; continuing unindexed:", (e as Error).message);
  }
}
