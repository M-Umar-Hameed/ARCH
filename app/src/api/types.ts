export type Ticket = {
  id: string; projectId: string; title: string; body: string;
  status: "open" | "in_progress" | "closed"; priority: "low" | "normal" | "high";
  assigneeId: string | null; version: number; createdAt: string; updatedAt: string;
};
export type Comment = { id: string; ticketId: string; authorId: string; body: string; createdAt: string };
export type Event = {
  id: string; actorId: string; ticketId: string | null; noteId: string | null;
  action: string; changes: Record<string, { from: unknown; to: unknown }> | null; at: string;
};
export type Project = { id: string; key: string; name: string; createdAt: string };
export type Actor = { id: string; name: string; kind: string; role: string };
export type Note = { id: string; actorId: string; body: string; scope: string; refId: string | null; indexed: boolean; createdAt: string };
export type Hit = { content: string; sourceKind: string; sourceRef: string; score: number; citation: string };
