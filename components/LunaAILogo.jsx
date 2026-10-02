import Image from "next/image";

// Both supplied marks stay in the DOM so a theme change can swap them without
// waiting for another image request. CSS chooses the high-contrast version for
// the active palette.
export default function LunaAILogo({ className = "" }) {
  return (
    <>
      <Image
        src="/lilo-moon-light.png"
        alt=""
        width={52}
        height={52}
        unoptimized
        className={`${className} lilo-logo-light`}
      />
      <Image
        src="/lilo-moon-dark.png"
        alt=""
        width={52}
        height={52}
        unoptimized
        className={`${className} lilo-logo-dark`}
      />
    </>
  );
}
