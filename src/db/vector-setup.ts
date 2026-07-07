import { sql } from "./client.js";

export async function ensureExtension(): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
}

export async function ensureIndex(): Promise<void> {
  await sql`CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
    ON embeddings USING hnsw (embedding vector_cosine_ops)`;
}
