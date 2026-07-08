import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { tickets } from "../api/tickets.js";
import { projects } from "../api/projects.js";
import { actors } from "../api/actors.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function ListScreen() {
  const [projectId, setProjectId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const projQ = useQuery({ queryKey: ["projects"], queryFn: projects.list });
  const actQ = useQuery({ queryKey: ["actors"], queryFn: actors.list });
  const listQ = useQuery({
    queryKey: ["tickets", { projectId, status, q }],
    queryFn: () => q ? tickets.search(q) : tickets.list({ projectId: projectId || undefined, status: status || undefined }),
  });
  const actorName = (id: string | null) => actQ.data?.find((a) => a.id === id)?.name ?? "-";

  return (
    <div>
      <h2>Tickets</h2>
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        <option value="">All projects</option>
        {projQ.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Any status</option><option>open</option><option>in_progress</option><option>closed</option>
      </select>
      <input placeholder="search" value={q} onChange={(e) => setQ(e.target.value)} />
      <Link to="/create">New ticket</Link>
      {listQ.isError && <div role="alert">Failed to load</div>}
      <ul>
        {listQ.data?.map((t) => (
          <li key={t.id}>
            <Link to="/tickets/$id" params={{ id: t.id }}>{t.title}</Link>{" "}
            <StatusBadge status={t.status} /> {t.priority} · {actorName(t.assigneeId)}
          </li>
        ))}
      </ul>
    </div>
  );
}
