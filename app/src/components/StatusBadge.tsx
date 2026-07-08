export function StatusBadge({ status }: { status: string }) {
  const c = status === "open" ? "#39c" : status === "in_progress" ? "#e90" : "#6a6";
  return <span style={{ background: c, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>{status}</span>;
}
