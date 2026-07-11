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
  listExternalTickets(since?: Date): Promise<ExternalTicket[]>;
}
