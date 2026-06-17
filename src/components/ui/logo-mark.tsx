import Image from "next/image";

/** SVG coin stamp mark — M inside a circular dashed ring */
export function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <Image
      src="/cadenz-logo.png"
      alt="Cadenz logo"
      width={size}
      height={size}
      loading="eager"
    />
  )
}
