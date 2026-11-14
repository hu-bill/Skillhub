// The Skillhub mark, drawn from the brand SVGs (paths.ts). Colour comes from `--accent`.
// The arrow is the one moving part of the brand: it travels forward and never spins.

import { ARROW_PATH, ARROW_VIEWBOX, WORDMARK_ARROW, WORDMARK_LETTERS, WORDMARK_VIEWBOX } from './paths.ts';

export function Logo({ height = 24, intro = false }: { height?: number; intro?: boolean }) {
  return (
    <svg className={`logo ${intro ? 'logo-intro' : ''}`} viewBox={WORDMARK_VIEWBOX} height={height} width={(height * 314) / 71} fill="currentColor" role="img" aria-label="Skillhub">
      <path className="logo-arrow" d={WORDMARK_ARROW} />
      {WORDMARK_LETTERS.map((d) => (
        <path key={d.slice(0, 24)} className="logo-letter" d={d} />
      ))}
    </svg>
  );
}

export function Arrow({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox={ARROW_VIEWBOX} height={size} width={(size * 23) / 69} fill="currentColor" aria-hidden="true">
      <path d={ARROW_PATH} />
    </svg>
  );
}

/** Three arrows marching forward: the brand's way of saying "working on it". */
export function Marching({ size = 14 }: { size?: number }) {
  return (
    <span className="marching" aria-hidden="true">
      <Arrow size={size} />
      <Arrow size={size} />
      <Arrow size={size} />
    </span>
  );
}
