// Slice `usage`: tokens processed per app over time, what is left of each rate-limit window,
// and which models, projects and skills the tokens went to.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HarnessSnapshot, UsageDay, UsageLimit } from '../../../shared/schema.ts';
import { useShell, type FeatureDescriptor } from '../../shell/context.ts';
import { appColor, appName, formatDate, formatTokens } from '../../shell/ui.tsx';
import styles from './usage.module.css';

type Range = 30 | 90 | 0;

interface Column {
  key: string;
  label: string;
  byApp: Map<string, number>;
  total: number;
}

const DAY_MS = 86_400_000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** One column per day, or per week once there are too many days to draw as separate bars. */
function buildColumns(daily: UsageDay[], range: Range, today: Date): Column[] {
  if (daily.length === 0) return [];
  const end = new Date(`${isoDay(today)}T00:00:00Z`).getTime();
  const firstDay = new Date(`${daily[0].day}T00:00:00Z`).getTime();
  const start = range === 0 ? firstDay : end - (range - 1) * DAY_MS;
  const span = Math.round((end - start) / DAY_MS) + 1;
  const weekly = span > 100;
  const columns = new Map<string, Column>();
  const order: string[] = [];
  for (let time = start; time <= end; time += DAY_MS) {
    const day = isoDay(new Date(time));
    const key = weekly ? isoDay(new Date(start + Math.floor((time - start) / (7 * DAY_MS)) * 7 * DAY_MS)) : day;
    if (!columns.has(key)) {
      const date = new Date(`${key}T00:00:00Z`);
      const text = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      columns.set(key, { key, label: weekly ? `Week of ${text}` : text, byApp: new Map(), total: 0 });
      order.push(key);
    }
  }
  for (const entry of daily) {
    const time = new Date(`${entry.day}T00:00:00Z`).getTime();
    if (time < start || time > end) continue;
    const key = weekly ? isoDay(new Date(start + Math.floor((time - start) / (7 * DAY_MS)) * 7 * DAY_MS)) : entry.day;
    const column = columns.get(key);
    if (!column) continue;
    column.byApp.set(entry.app, (column.byApp.get(entry.app) ?? 0) + entry.total);
    column.total += entry.total;
  }
  return order.map((key) => columns.get(key)!);
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function useElementWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function StackedBars({ columns, apps, snapshot }: { columns: Column[]; apps: string[]; snapshot: HarnessSnapshot }) {
  const [ref, width] = useElementWidth();
  const [active, setActive] = useState<number>();
  const height = 240;
  const margin = { top: 10, right: 8, bottom: 24, left: 44 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(...columns.map((column) => column.total), 1));
  const slot = plotW / Math.max(columns.length, 1);
  const barW = Math.max(2, Math.min(28, slot * 0.68));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);
  const labelEvery = Math.max(1, Math.ceil(columns.length / Math.max(2, Math.floor(plotW / 70))));
  const gap = barW >= 6 ? 2 : 0;
  const hovered = active !== undefined ? columns[active] : undefined;

  return (
    <div className={styles.chartWrap} ref={ref} onMouseLeave={() => setActive(undefined)}>
      <svg className={styles.chart} width={width} height={height} role="img" aria-label="Tokens processed per period, stacked by app">
        {ticks.map((tick) => {
          const y = margin.top + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line className={styles.gridline} x1={margin.left} x2={width - margin.right} y1={y} y2={y} />
              <text className={styles.axisText} x={margin.left - 8} y={y + 4} textAnchor="end">
                {formatTokens(tick)}
              </text>
            </g>
          );
        })}
        {columns.map((column, index) => {
          const x = margin.left + index * slot + (slot - barW) / 2;
          let offset = 0;
          const present = apps.filter((app) => (column.byApp.get(app) ?? 0) > 0);
          return (
            <g key={column.key}>
              {present.map((app, position) => {
                const value = column.byApp.get(app) ?? 0;
                const full = (value / max) * plotH;
                const isTop = position === present.length - 1;
                const h = Math.max(1, full - (isTop ? 0 : gap));
                const y = margin.top + plotH - offset - full + (isTop ? 0 : gap);
                offset += full;
                const radius = isTop ? Math.min(4, barW / 2, h) : 0;
                return (
                  <path
                    key={app}
                    fill={appColor(app)}
                    d={`M${x} ${y + h} V${y + radius} Q${x} ${y} ${x + radius} ${y} H${x + barW - radius} Q${x + barW} ${y} ${x + barW} ${y + radius} V${y + h} Z`}
                  />
                );
              })}
              {index % labelEvery === 0 ? (
                <text className={styles.axisText} x={x + barW / 2} y={height - 6} textAnchor="middle">
                  {column.label.replace('Week of ', '')}
                </text>
              ) : null}
              <rect
                className={`${styles.hit} ${active === index ? styles.hitActive : ''}`}
                x={margin.left + index * slot}
                y={margin.top}
                width={slot}
                height={plotH}
                onMouseEnter={() => setActive(index)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && active !== undefined ? (
        <div
          className={styles.tooltip}
          style={
            active > columns.length / 2
              ? { right: width - (margin.left + active * slot) + 8 }
              : { left: margin.left + (active + 1) * slot + 8 }
          }
        >
          <strong>{hovered.label}</strong>
          {apps
            .filter((app) => (hovered.byApp.get(app) ?? 0) > 0)
            .map((app) => (
              <div key={app} className={styles.tooltipRow}>
                <span className="app-dot" style={{ background: appColor(app) }} />
                {appName(snapshot, app)}
                <b>{formatTokens(hovered.byApp.get(app) ?? 0)}</b>
              </div>
            ))}
          {hovered.total === 0 ? <span className="muted">No recorded use</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Meter({ limit, snapshot }: { limit: UsageLimit; snapshot: HarnessSnapshot }) {
  const used = Math.max(0, Math.min(100, limit.usedPercent));
  const left = Math.round(100 - used);
  return (
    <div className={`${styles.meter} ${limit.stale ? styles.meterStale : ''}`}>
      <div className={styles.meterHead}>
        <span>
          <strong>{appName(snapshot, limit.app)}</strong> · {limit.label}
        </span>
        <span>{limit.stale ? `was ${Math.round(used)}% used` : `${left}% left`}</span>
      </div>
      <div className={styles.meterTrack} role="img" aria-label={`${Math.round(used)} percent used`}>
        <div className={styles.meterFill} style={{ width: `${used}%` }} />
      </div>
      <div className={styles.meterNote}>
        {limit.stale
          ? `Last reading ${formatDate(limit.observedAt)}. That window has reset since, so the current figure is not known until the app is used again.`
          : `${Math.round(used)}% used as of ${formatDate(limit.observedAt)}${limit.resetsAt ? `, resets ${new Date(limit.resetsAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}.`}{' '}
        {limit.source}.
      </div>
    </div>
  );
}

function Usage() {
  const { snapshot } = useShell();
  const usage = snapshot.slices.usage;
  const [range, setRange] = useState<Range>(30);
  const today = useMemo(() => new Date(snapshot.generatedAt), [snapshot.generatedAt]);
  const columns = useMemo(() => buildColumns(usage.daily, range, today), [usage.daily, range, today]);
  const apps = useMemo(() => [...new Set(usage.daily.map((entry) => entry.app))].sort(), [usage.daily]);

  const recorded = usage.sources.filter((source) => source.status === 'ok');
  if (recorded.length === 0) {
    return (
      <div className="card empty">
        None of the AI apps found here writes token counts to local files, so there is nothing to add up.
        <ul className={styles.sources} style={{ marginTop: 16, textAlign: 'left' }}>
          {usage.sources.map((source) => (
            <li key={source.app}>
              <strong>{appName(snapshot, source.app)}</strong>
              <span className="muted">{source.note}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const rangeTotal = columns.reduce((sum, column) => sum + column.total, 0);
  const startDay = columns.length > 0 ? columns[0].key : '';
  const inRange = usage.daily.filter((entry) => range === 0 || entry.day >= startDay);
  const days = range === 0 ? Math.max(1, Math.round((today.getTime() - new Date(`${usage.daily[0]?.day ?? isoDay(today)}T00:00:00Z`).getTime()) / DAY_MS) + 1) : range;
  const cacheRead = inRange.reduce((sum, entry) => sum + entry.cacheRead, 0);
  const splitTotal = inRange.filter((entry) => entry.app === 'claude-code').reduce((sum, entry) => sum + entry.total, 0);
  const cost = usage.sources.find((source) => source.costUSD !== undefined);
  const allTime = recorded.reduce((sum, source) => sum + source.totals.total, 0);
  const sessions = recorded.reduce((sum, source) => sum + source.sessions, 0);
  const topModel = Math.max(...usage.models.map((model) => model.total), 1);
  const topProject = Math.max(...usage.projects.map((project) => project.total), 1);
  const topCounter = Math.max(...usage.counters.map((counter) => counter.count), 1);
  const rangeLabel = range === 0 ? 'all recorded time' : `the last ${range} days`;

  return (
    <div>
      <div className={styles.filters}>
        <div className={styles.seg} role="group" aria-label="Time range">
          {([30, 90, 0] as Range[]).map((value) => (
            <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>
              {value === 0 ? 'All time' : `${value} days`}
            </button>
          ))}
        </div>
        <span className="faint">Counted from files on this computer. Cached tokens are included.</span>
      </div>

      <div className={styles.tiles}>
        <div className="card">
          <div className={styles.tileLabel}>Tokens processed</div>
          <div className={styles.tileValue}>{formatTokens(rangeTotal)}</div>
          <div className={styles.tileNote}>in {rangeLabel}</div>
        </div>
        <div className="card">
          <div className={styles.tileLabel}>Average per day</div>
          <div className={styles.tileValue}>{formatTokens(rangeTotal / days)}</div>
          <div className={styles.tileNote}>across {days} days</div>
        </div>
        <div className="card">
          <div className={styles.tileLabel}>Served from cache</div>
          <div className={styles.tileValue}>{splitTotal > 0 ? `${Math.round((cacheRead / splitTotal) * 100)}%` : 'n/a'}</div>
          <div className={styles.tileNote}>of Claude Code tokens in {rangeLabel}</div>
        </div>
        <div className="card">
          <div className={styles.tileLabel}>API-equivalent cost</div>
          <div className={styles.tileValue}>{cost?.costUSD !== undefined ? `$${Math.round(cost.costUSD).toLocaleString('en-US')}` : 'n/a'}</div>
          <div className={styles.tileNote}>
            {cost ? `${appName(snapshot, cost.app)}, all time. What the tokens would cost at API prices, not a bill.` : 'No app records a cost figure.'}
          </div>
        </div>
      </div>

      <div className={`card ${styles.section}`}>
        <div className={styles.sectionHead}>
          <h3>Tokens per {columns.length > 0 && columns[0].label.startsWith('Week') ? 'week' : 'day'}</h3>
          <div className={styles.legend}>
            {apps.map((app) => (
              <span key={app}>
                <span className="app-dot" style={{ background: appColor(app) }} />
                {appName(snapshot, app)}
              </span>
            ))}
          </div>
        </div>
        <StackedBars columns={columns} apps={apps} snapshot={snapshot} />
        <details className={styles.tableToggle}>
          <summary>Show as a table</summary>
          <table className="grid">
            <thead>
              <tr>
                <th>Period</th>
                {apps.map((app) => (
                  <th key={app} className="num">
                    {appName(snapshot, app)}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {columns
                .filter((column) => column.total > 0)
                .map((column) => (
                  <tr key={column.key}>
                    <td>{column.label}</td>
                    {apps.map((app) => (
                      <td key={app} className="num">
                        {formatTokens(column.byApp.get(app) ?? 0)}
                      </td>
                    ))}
                    <td className="num">{formatTokens(column.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className={styles.two}>
        <div className="card">
          <div className={styles.sectionHead}>
            <h3>What is left</h3>
          </div>
          {usage.limits.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No app here saves how much of its limit is left. Check each app&rsquo;s own usage page.
            </p>
          ) : (
            usage.limits.map((limit) => <Meter key={`${limit.app}:${limit.label}`} limit={limit} snapshot={snapshot} />)
          )}
        </div>
        <div className="card">
          <div className={styles.sectionHead}>
            <h3>Where the numbers come from</h3>
            <span className="faint">
              {formatTokens(allTime)} tokens · {sessions} sessions on record
            </span>
          </div>
          <ul className={styles.sources}>
            {usage.sources.map((source) => (
              <li key={source.app}>
                <span className={styles.name}>
                  <span className="app-dot" style={{ background: appColor(source.app) }} />
                  <span>
                    <strong>{appName(snapshot, source.app)}</strong>
                    {source.status === 'ok' ? ` · ${formatTokens(source.totals.total)}` : ''}
                  </span>
                </span>
                <span className="muted">{source.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.two}>
        <div className="card">
          <div className={styles.sectionHead}>
            <h3>By model</h3>
            <span className="faint">all time</span>
          </div>
          <table className="grid">
            <tbody>
              {usage.models.slice(0, 8).map((model) => (
                <tr key={`${model.app}:${model.model}`}>
                  <td>
                    <span className={styles.name}>
                      <span className="app-dot" style={{ background: appColor(model.app) }} />
                      <span>{model.model}</span>
                    </span>
                  </td>
                  <td className="num">
                    <span className={styles.barCell}>
                      {formatTokens(model.total)}
                      <span className={styles.barTrack}>
                        <span className={styles.bar} style={{ width: `${(model.total / topModel) * 100}%`, background: appColor(model.app) }} />
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className={styles.sectionHead}>
            <h3>By project folder</h3>
            <span className="faint">all time</span>
          </div>
          <table className="grid">
            <tbody>
              {usage.projects.slice(0, 8).map((project) => (
                <tr key={`${project.app}:${project.project}`}>
                  <td>
                    <span className={styles.name}>
                      <span className="app-dot" style={{ background: appColor(project.app) }} />
                      <span>{project.project}</span>
                    </span>
                  </td>
                  <td className="num">
                    <span className={styles.barCell}>
                      {formatTokens(project.total)}
                      <span className={styles.barTrack}>
                        <span className={styles.bar} style={{ width: `${(project.total / topProject) * 100}%`, background: appColor(project.app) }} />
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {usage.counters.length > 0 ? (
        <div className="card">
          <div className={styles.sectionHead}>
            <h3>Most used skills and plugins</h3>
            <span className="faint">times invoked, as counted by Claude Code</span>
          </div>
          <table className="grid">
            <tbody>
              {usage.counters.slice(0, 12).map((counter) => (
                <tr key={`${counter.kind}:${counter.name}`}>
                  <td>
                    {counter.name} <span className="badge">{counter.kind}</span>
                  </td>
                  <td className="faint">{counter.lastUsedAt ? `last used ${formatDate(counter.lastUsedAt)}` : ''}</td>
                  <td className="num">
                    <span className={styles.barCell}>
                      {counter.count.toLocaleString('en-US')}
                      <span className={styles.barTrack}>
                        <span className={styles.bar} style={{ width: `${(counter.count / topCounter) * 100}%`, background: appColor(counter.app) }} />
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export const feature: FeatureDescriptor = {
  id: 'usage',
  title: 'Usage',
  summary: 'Tokens your AI apps have used, and what is left.',
  group: 1,
  order: 40,
  Component: Usage,
};
