export function LogoMark({ size = 18, jpg = false }: { size?: number; jpg?: boolean }) {
  return (
    <img
      className="brand-logo"
      src={jpg ? "/brand/feedbot-logo.jpg" : "/brand/feedbot-logo.png"}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
