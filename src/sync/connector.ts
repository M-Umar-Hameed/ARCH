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
  // recently-touched tickets. The import engine advances its cursor per ticket; an
  // inclusive `since` is what lets a comment that failed mid-run be retried on the
  // next poll (the ticket re-appears and comment-dedup fills the gap). GitHub's
  // `since` param is inclusive, which satisfies this.
  listExternalTickets(since?: Date): Promise<ExternalTicket[]>;
}
