// Spine: small shared pieces every feature slice can import. Third-party text (skill descriptions,
// registry entries) is always rendered as plain React text, never as HTML.

import { useEffect, useState, type ReactNode } from 'react';
import type { AppInfo, HarnessSnapshot } from '../../shared/schema.ts';
import { tagLabel } from '../../shared/tags.ts';

/** An app's identity colour: a token per app in shell.css, taken from the app's own icon. */
export function appColor(appId: string): string {
  return `var(--app-${appId.replace(/[^a-z0-9-]/g, '')}, var(--series-other))`;
}

export function appName(snapshot: HarnessSnapshot, appId: string): string {
  return snapshot.slices.apps.items.find((app) => app.id === appId)?.name ?? appId;
}

export function detectedApps(snapshot: HarnessSnapshot): AppInfo[] {
  return snapshot.slices.apps.items.filter((app) => app.detected);
}

/**
 * An app's mark. The real logo when the app is installed (served from the app's own icon file),
 * otherwise a monogram tile in the app's identity colour.
 */
export function AppMark({ snapshot, appId, size = 18 }: { snapshot: HarnessSnapshot; appId: string; size?: number }) {
  const app = snapshot.slices.apps.items.find((item) => item.id === appId);
  const name = app?.name ?? appId;
  if (app?.hasIcon) {
    return <img className="app-mark" src={`/api/app-icon?id=${encodeURIComponent(appId)}`} width={size} height={size} alt="" title={name} loading="lazy" />;
  }
  const letters = name
    .split(/[\s(]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <span className="app-mark app-mark-mono" style={{ width: size, height: size, background: appColor(appId), fontSize: Math.max(8, size * 0.42) }} title={name} aria-hidden="true">
      {letters}
    </span>
  );
}

export function AppChip({ snapshot, appId }: { snapshot: HarnessSnapshot; appId: string }) {
  return (
    <span className="badge app-chip">
      <AppMark snapshot={snapshot} appId={appId} size={15} />
      {appName(snapshot, appId)}
    </span>
  );
}

/** A topic tag. A button when it filters something, plain text otherwise. */
export function TagChip({ id, active = false, onClick }: { id: string; active?: boolean; onClick?: () => void }) {
  const label = tagLabel(id);
  if (!onClick) return <span className="tag">{label}</span>;
  return (
    <button type="button" className="tag tag-button" aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );
}

interface SkillCardProps {
  name: string;
  /** Who made it or where it lives, shown small under the name. */
  owner?: string;
  description: string;
  tags: string[];
  /** A short status on the top right, such as "Installed". */
  status?: ReactNode;
  /** Bottom left: a number or the apps that have it. */
  meta?: ReactNode;
  /** Bottom right: the one thing to do with this card. */
  action?: ReactNode;
  href?: string;
  onTag?: (id: string) => void;
  /** Makes the whole card open something (a detail panel). */
  onOpen?: () => void;
}

/** One skill, as a card: name, a two-line description, tags, and one action. Text is always plain. */
export function SkillCard({ name, owner, description, tags, status, meta, action, href, onTag, onOpen }: SkillCardProps) {
  const hue = tags[0] ?? 'none';
  return (
    <article
      className={`skill-card ${onOpen ? 'skill-card-open' : ''}`}
      onClick={
        onOpen
          ? (event) => {
              // A click on a tag, link or button inside the card does its own thing.
              if (!(event.target as HTMLElement).closest('button, a')) onOpen();
            }
          : undefined
      }
    >
      <header className="skill-card-head">
        <span className={`skill-glyph skill-glyph-${hue}`} aria-hidden="true">
          {name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '?'}
        </span>
        <div className="skill-card-title">
          {href ? (
            <a className="skill-card-name" href={href} target="_blank" rel="noreferrer noopener" title={name}>
              {name}
            </a>
          ) : onOpen ? (
            <button type="button" className="skill-card-name skill-card-name-button" title={name} onClick={onOpen}>
              {name}
            </button>
          ) : (
            <span className="skill-card-name" title={name}>
              {name}
            </span>
          )}
          {owner ? <span className="skill-card-owner">{owner}</span> : null}
        </div>
        {status ? <span className="skill-card-status">{status}</span> : null}
      </header>
      <p className="skill-card-text">{description}</p>
      {tags.length > 0 ? (
        <div className="skill-card-tags">
          {tags.map((tag) => (
            <TagChip key={tag} id={tag} onClick={onTag ? () => onTag(tag) : undefined} />
          ))}
        </div>
      ) : null}
      <footer className="skill-card-foot">
        <span className="skill-card-meta">{meta}</span>
        {action}
      </footer>
    </article>
  );
}

/** 1234567 -> "1.2M". Keeps three significant figures at most. */
export function formatTokens(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  return String(Math.round(value));
}

function trim(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1).replace(/\.0$/, '') : value.toFixed(2).replace(/\.?0+$/, '');
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A command to copy. The dashboard never runs anything itself. */
export function Command({ command, label }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div>
      {label ? <div className="cmd-label">{label}</div> : null}
      <div className="cmd">
        <pre>{command}</pre>
        <button type="button" className="btn" onClick={copy} aria-label={`Copy command${label ? ` for ${label}` : ''}`}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/** A panel that slides in from the right for the details of one thing. Esc or the backdrop closes it. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Leave Esc to a confirmation dialog when one is open on top.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
