import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Luna Terminal, a free financial terminal for traders and financial advisors";

const tools = ["Market dashboard", "Stock research", "Screeners and maps", "Advisor tools"];

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", background: "#0d1117", color: "#e6edf3",
        padding: "72px 80px", fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", position: "relative", width: 54, height: 54, alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", position: "absolute", width: 40, height: 40, borderRadius: 999, background: "#f5f5f2" }} />
          <div style={{ display: "flex", position: "absolute", width: 35, height: 35, borderRadius: 999, background: "#0d1117", transform: "translate(10px, -7px)" }} />
          <div style={{ display: "flex", position: "absolute", width: 47, height: 3, bottom: 5, borderRadius: 999, background: "#f5f5f2" }} />
        </div>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>Luna Terminal</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 }}>
        <div style={{ display: "flex", fontSize: 72, lineHeight: 1.05, fontWeight: 750, letterSpacing: -2 }}>
          Your free financial research terminal
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#9da7b3", lineHeight: 1.35 }}>
          Built for traders and financial advisors.
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 24, fontSize: 21, color: "#9da7b3" }}>
          {tools.map((tool) => <div key={tool} style={{ display: "flex" }}>{tool}</div>)}
        </div>
        <div style={{ display: "flex", color: "#18a999", fontSize: 22 }}>lunaterminal.com</div>
      </div>
    </div>,
    size
  );
}
