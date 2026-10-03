// SVG logos are flattened locally before storage/export. Keep drawing elements
// only; scripts, foreignObject, URLs, events and CSS are never rendered.
export async function reportImageFile(file) {
  if (
    file.size > 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)
  )
    throw new Error("Use a JPEG, PNG or SVG image under 1 MB.");
  if (file.type !== "image/svg+xml")
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.readAsDataURL(file);
    });
  const parsed = new DOMParser().parseFromString(
    await file.text(),
    "image/svg+xml",
  );
  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.localName !== "svg"
  )
    throw new Error("Could not read that SVG.");
  const allowed = new Set([
    "svg",
    "g",
    "defs",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "linearGradient",
    "radialGradient",
    "stop",
    "clipPath",
    "mask",
  ]);
  const attributes = new Set([
    "xmlns",
    "viewBox",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-opacity",
    "opacity",
    "transform",
    "id",
    "offset",
    "stop-color",
    "stop-opacity",
    "font-size",
    "font-family",
    "font-weight",
    "text-anchor",
    "gradientUnits",
    "gradientTransform",
    "clip-path",
  ]);
  for (const el of [...parsed.querySelectorAll("*")]) {
    if (!allowed.has(el.localName)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes])
      if (
        !attributes.has(attr.name) ||
        /url\((?!#[a-z0-9_-]+\))/i.test(attr.value)
      )
        el.removeAttribute(attr.name);
  }
  const svg = parsed.documentElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const view = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  const w =
      view[2] > 0 ? view[2] : parseFloat(svg.getAttribute("width")) || 512,
    h = view[3] > 0 ? view[3] : parseFloat(svg.getAttribute("height")) || 512;
  const scale = 512 / Math.max(w, h);
  svg.setAttribute("width", String(Math.max(1, Math.round(w * scale))));
  svg.setAttribute("height", String(Math.max(1, Math.round(h * scale))));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not render that SVG."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Number(svg.getAttribute("width"));
    canvas.height = Number(svg.getAttribute("height"));
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
