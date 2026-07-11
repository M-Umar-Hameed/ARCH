export type ExternalComment = { externalId: string; author: string; body: string; createdAt: string };
export type ExternalTicket = {
  externalId: string;
  title: string;
  body: string;
  status: "open" | "in_progress" | "closed";
  updatedAt: string;
  comments: ExternalComment[];
};
export interface SourceConnector {
  source: string;
  // `since` filtering MUST be inclusive (updatedAt >= since), or otherwise re-surface
  // recently-touched tickets. The cursor is the max externalUpdatedAt across all synced
  // tickets, so self-heal only holds for a failed item at or above that run's max
  // updatedAt; an older item that fails while a newer one succeeds sits below the next
  // cursor and won't be retried until its own external updatedAt changes. GitHub's
  // `since` param is inclusive, which satisfies the inclusive requirement above.
  listExternalTickets(since?: Date): Promise<ExternalTicket[]>;
}
