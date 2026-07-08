import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { projects } from "../api/projects.js";
import { actors } from "../api/actors.js";
import { tickets } from "../api/tickets.js";
import { StaleVersionError } from "../api/errors.js";
import { Banner } from "../components/Banner.js";

export function CreateScreen() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const pq = useQuery({ queryKey: ["projects"], queryFn: projects.list });
  const aq = useQuery({ queryKey: ["actors"], queryFn: actors.list });
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assigneeId, setAssigneeId] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [projErr, setProjErr] = useState<string | null>(null);

  const createProj = useMutation({
    mutationFn: () => projects.create({ key: newKey, name: newName }),
    onSuccess: (p) => { setProjErr(null); setProjectId(p.id); setNewKey(""); setNewName(""); qc.invalidateQueries({ queryKey: ["projects"] }); },
    onError: (e) => setProjErr(e instanceof StaleVersionError ? "project key already exists" : "failed to create project"),
  });
  const createTicket = useMutation({
    mutationFn: () => tickets.create({ projectId, title, body, priority, assigneeId: assigneeId || undefined }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["tickets"] }); nav({ to: "/tickets/$id", params: { id: t.id } }); },
  });

  return (
    <div>
      <h2>New ticket</h2>
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        <option value="">Select project</option>
        {pq.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <fieldset>
        <legend>New project</legend>
        <input placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <input placeholder="name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button onClick={() => createProj.mutate()}>Create project</button>
        {projErr && <Banner kind="error" message={projErr} />}
      </fieldset>
      <input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="body" value={body} onChange={(e) => setBody(e.target.value)} />
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option>low</option><option>normal</option><option>high</option>
      </select>
      <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
        <option value="">Unassigned</option>
        {aq.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button disabled={!projectId || !title} onClick={() => createTicket.mutate()}>Create</button>
    </div>
  );
}
