import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notes } from "../api/notes.js";
import { StaleVersionError } from "../api/errors.js";
import type { Note } from "../api/types.js";

const badgeClass = "px-2 py-0.5 rounded border font-code-sm text-[10px] uppercase tracking-wider border-secondary/30 bg-secondary/10 text-secondary shrink-0";
const inputClass = "w-full bg-surface-container-lowest border border-white/5 px-3 py-2 rounded text-on-surface outline-none text-sm";

export function NotesPanel() {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["notes"], queryFn: () => notes.list() });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [conflict, setConflict] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const current = listQ.data?.find((n) => n.id === expandedId);

  function expand(n: Note) {
    setExpandedId(n.id);
    setDraftTitle(n.title ?? "");
    setDraftBody(n.body);
    setConflict(false);
    setActionError(null);
  }

  const save = useMutation({
    mutationFn: () => notes.update(current!.id, current!.version, { title: draftTitle || undefined, body: draftBody }),
    onSuccess: () => { setConflict(false); setExpandedId(null); qc.invalidateQueries({ queryKey: ["notes"] }); },
    onError: (e) => {
      if (e instanceof StaleVersionError) { setConflict(true); qc.invalidateQueries({ queryKey: ["notes"] }); }
    },
  });

  const remove = useMutation({
    mutationFn: () => notes.remove(current!.id, current!.version),
    onSuccess: () => setExpandedId(null),
    onError: (e) => setActionError(e instanceof Error ? e.message : "Failed to delete note"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });

  const create = useMutation({
    mutationFn: () => notes.save({ body: newBody, scope: "global", title: newTitle || undefined }),
    onSuccess: () => {
      setCreateError(null);
      setNewTitle(""); setNewBody("");
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (e) => setCreateError(e instanceof Error ? e.message : "Failed to add note"),
  });

  function saveDraft() {
    if (!current) { setActionError("note no longer exists"); return; }
    save.mutate();
  }

  function deleteNote() {
    if (!current) { setActionError("note no longer exists"); return; }
    if (window.confirm("Delete this note?")) remove.mutate();
  }

  return (
    <div className="glass-card rounded-xl p-6 space-y-6">
      <div className="flex items-center gap-2 text-primary-fixed-dim">
        <span className="material-symbols-outlined text-base">sticky_note_2</span>
        <h3 className="font-headline-md text-headline-md">Notes</h3>
      </div>

      <div className="space-y-2">
        {listQ.isLoading && <div className="font-code-sm text-on-surface-variant/70 text-xs uppercase tracking-widest">Loading notes...</div>}
        {listQ.data?.length === 0 && <div className="font-code-sm text-on-surface-variant/50 text-xs uppercase tracking-widest">No notes yet</div>}
        {listQ.data?.map((n) => (
          <div key={n.id} className="border border-white/5 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface-container-lowest hover:bg-white/5 transition-colors cursor-pointer text-left"
              onClick={() => (expandedId === n.id ? setExpandedId(null) : expand(n))}
            >
              <span className="font-body-sm text-on-surface truncate">{n.title || n.body.split("\n")[0].slice(0, 80)}</span>
              <span className={badgeClass}>{n.scope}</span>
            </button>

            {expandedId === n.id && (
              <div className="p-4 space-y-3 border-t border-white/5">
                {conflict && (
                  <div className="bg-error-container/20 border border-error p-3 rounded text-error text-xs font-code-sm">
                    Note changed elsewhere — review and save again.
                  </div>
                )}
                {actionError && (
                  <div className="bg-error-container/20 border border-error p-3 rounded text-error text-xs font-code-sm">
                    {actionError}
                  </div>
                )}
                <input className={inputClass} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Title (optional)" />
                <textarea
                  className={`${inputClass} min-h-[100px] resize-y`}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    className="px-3 py-1.5 bg-error/10 hover:bg-error/20 text-error border border-error/30 rounded font-code-label text-[10px] uppercase tracking-widest cursor-pointer"
                    onClick={deleteNote}
                  >
                    Delete
                  </button>
                  <button
                    className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded font-code-label text-[10px] uppercase tracking-widest cursor-pointer disabled:opacity-50"
                    disabled={!draftBody.trim() || save.isPending}
                    onClick={saveDraft}
                  >
                    {save.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-4 border-t border-white/5">
        <p className="font-code-sm text-[10px] text-on-surface-variant uppercase opacity-50">New note</p>
        {createError && (
          <div className="bg-error-container/20 border border-error p-3 rounded text-error text-xs font-code-sm">
            {createError}
          </div>
        )}
        <input className={inputClass} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title (optional)" />
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Note body..."
        />
        <button
          className="w-full bg-secondary/20 hover:bg-secondary/40 text-secondary border border-secondary/50 py-2 rounded font-code-label uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50"
          disabled={!newBody.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Saving..." : "Add note"}
        </button>
      </div>
    </div>
  );
}
