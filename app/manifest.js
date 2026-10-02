export default function manifest() {
  return {
    name: "Luna Terminal", short_name: "Luna",
    description: "Market sentiment, stock research, screeners, maps, earnings, and portfolio analysis.",
    start_url: "/dashboard", display: "standalone", background_color: "#081D4D", theme_color: "#081D4D",
    icons: [{ src: "/brand/luna-icon-256.png", sizes: "256x256", type: "image/png" }],
  };
}
