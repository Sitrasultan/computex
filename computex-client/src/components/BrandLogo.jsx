export default function BrandLogo({
  href = "/",
  size = 44,
  textClassName = "",
  className = "",
  subtitle = "",
  showText = true,
}) {
  return (
    <a href={href} className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src="/computex-preview.png"
        alt="ComputeX logo"
        width={size}
        height={size}
        className="rounded-xl shadow-[0_10px_28px_rgba(14,116,144,0.28)] ring-1 ring-cyan-200/50 dark:ring-sky-400/30"
        loading="eager"
      />
      {showText ? (
        <span className="flex flex-col leading-tight">
          <span className={`font-semibold text-sky-600 dark:text-sky-300 ${textClassName}`}>ComputeX</span>
          {subtitle ? (
            <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{subtitle}</span>
          ) : null}
        </span>
      ) : null}
    </a>
  );
}
