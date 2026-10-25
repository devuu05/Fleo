export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
export const dateLabel = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const monthLabel = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
export const duration = (min: number | null) => (min == null ? null : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`);
export const stopsLabel = (n: number) => (n === 0 ? "Non-stop" : n === 1 ? "1 stop" : `${n} stops`);
