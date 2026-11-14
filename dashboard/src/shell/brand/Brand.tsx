// Spine: the Skillhub mark. The wordmark and the arrow come from the brand SVGs (see paths.ts);
// colour comes from `--accent`, so one component serves both themes.
// The arrow is the brand's one moving part: it always travels forward, never spins.

import { ARROW_PATH, ARROW_VIEWBOX, WORDMARK_ARROW, WORDMARK_LETTERS, WORDMARK_VIEWBOX } from './paths.ts';

interface LogoProps {
  height?: number;
  /** The arrow nudges forward while something is in progress. */
  busy?: boolean;
  /** Plays the entrance once: letters rise, then the arrow arrives. */
  intro?: boolean;
}

export function Logo({ height = 22, busy = false, intro = false }: LogoProps) {
  return (
    <svg
      className={`logo ${busy ? 'logo-busy' : ''} ${intro ? 'logo-intro' : ''}`}
      viewBox={WORDMARK_VIEWBOX}
      height={height}
      width={(height * 314) / 71}
      fill="currentColor"
      role="img"
      aria-label="Skillhub"
    >
      <path className="logo-arrow" d={WORDMARK_ARROW} />
      {WORDMARK_LETTERS.map((d) => (
        <path key={d.slice(0, 24)} className="logo-letter" d={d} />
      ))}
    </svg>
  );
}

/** The arrow on its own. `flip` points it left. */
export function Arrow({ size = 14, flip = false, className = '' }: { size?: number; flip?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      viewBox={ARROW_VIEWBOX}
      height={size}
      width={(size * 23) / 69}
      fill="currentColor"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d={ARROW_PATH} />
    </svg>
  );
}

/** Three arrows marching forward: the loading state everywhere in the app. */
export function ArrowLoader({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <span className="loader" role="status">
      <span className="loader-arrows" aria-hidden="true">
        <Arrow size={size} className="loader-arrow" />
        <Arrow size={size} className="loader-arrow" />
        <Arrow size={size} className="loader-arrow" />
      </span>
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

/** Full-page first load. */
export function Splash({ message }: { message: string }) {
  return (
    <div className="splash">
      <Logo height={46} intro />
      <ArrowLoader size={18} />
      <p>{message}</p>
    </div>
  );
}
