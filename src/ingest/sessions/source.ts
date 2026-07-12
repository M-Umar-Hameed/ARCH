export type SessionDoc = { ref: string; text: string; hash: string };
export interface SessionSource {
  source: string;
  listSessionDocs(sinceDays: number): Promise<SessionDoc[]>;
}
