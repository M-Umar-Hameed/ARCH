export function chunkMarkdown(
  text: string,
  maxChars = 1200,
): { index: number; content: string }[] {
  const lines = text.split(/\r?\n/);
  const sections: string[] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.join("\n").trim()) sections.push(cur.join("\n").trim()); cur = []; };
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) { flush(); cur.push(line); }
    else cur.push(line);
  }
  flush();

  const out: string[] = [];
  for (const sec of sections) {
    if (sec.length <= maxChars) { out.push(sec); continue; }
    let buf = "";
    for (const para of sec.split(/\n\s*\n/)) {
      if (buf && (buf.length + para.length + 2) > maxChars) { out.push(buf.trim()); buf = ""; }
      buf += (buf ? "\n\n" : "") + para;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.filter((c) => c.trim()).map((content, index) => ({ index, content }));
}
