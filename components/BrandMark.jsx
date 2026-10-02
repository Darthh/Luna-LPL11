import Image from "next/image";

export default function BrandMark({ className = "", size = 30, darkOnly = false }) {
  return (
    <span
      className={`brand-mark${darkOnly ? " brand-mark-dark-surface" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--brand-mark-size": `${size}px` }}
      aria-hidden="true"
    >
      <Image
        src="/brand/luna-mark-dark.png"
        alt=""
        width={444}
        height={444}
        className="brand-mark-image brand-mark-image-dark"
      />
      <Image
        src="/brand/luna-mark-light.png"
        alt=""
        width={444}
        height={444}
        className="brand-mark-image brand-mark-image-light"
      />
    </span>
  );
}
