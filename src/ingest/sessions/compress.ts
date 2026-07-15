// Deterministic text hygiene for session transcripts before embedding — no
// summarization, just strips noise that inflates token count for no signal.
const DECOR_RE = /^(?:[-=*#]{3,}|[─-╿]+)$/;
const MAX_LINE = 2_000;

export function compressSessionText(text: string): string {
  const rawLines = text.split(/\r?\n/);

  // Drop pure-decoration lines and exact-duplicate consecutive lines in one
  // pass. Blank lines are excluded from dedup — their run-length is handled
  // separately below (2 blanks is an intentional paragraph break, 3+ isn't).
  const lines: string[] = [];
  let prev: string | null = null;
  for (const raw of rawLines) {
    const isBlank = raw.trim() === "";
    if (!isBlank && DECOR_RE.test(raw.trim())) continue;
    if (!isBlank && raw === prev) continue;
    lines.push(raw);
    prev = raw;
  }

  // Collapse runs of 3+ blank lines to one.
  const collapsed: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line.trim() === "") { blanks++; continue; }
    if (blanks > 0) { collapsed.push(...Array(blanks >= 3 ? 1 : blanks).fill("")); blanks = 0; }
    collapsed.push(line);
  }
  if (blanks > 0) collapsed.push(...Array(blanks >= 3 ? 1 : blanks).fill(""));

  // Truncate oversized lines; collapse runs of spaces outside code fences.
  let inFence = false;
  const out = collapsed.map((line) => {
    if (line.trim().startsWith("```")) inFence = !inFence;
    let l = line.length > MAX_LINE ? line.slice(0, MAX_LINE) + "…" : line;
    if (!inFence) l = l.replace(/ {2,}/g, " ");
    return l;
  });

  return out.join("\n");
}
