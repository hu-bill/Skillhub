// Slice `map`: the connection map. Which AI app uses which skills and which MCP servers,
// and what is shared between them. It is also where connections are made and broken:
// drag the dot on a skill or server onto an app to connect it, click a link to disconnect it.
// Either gesture only opens the confirmation dialog; the shell applies nothing without a yes.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { alwaysOnTokens, portableServer } from '../../../shared/insights.ts';
import { DEFAULT_MAP_VIEW, type ActionRequest, type AppInfo, type HarnessSnapshot, type MapView } from '../../../shared/schema.ts';
import { Arrow } from '../../shell/brand/Brand.tsx';
import { useShell, type FeatureDescriptor } from '../../shell/context.ts';
import { AppChip, AppMark, appColor, formatTokens } from '../../shell/ui.tsx';
import { MapAssistant, type Turn } from './Assistant.tsx';
import styles from './map.module.css';
import panel from './panel.module.css';
import { buildMap, type MapLink, type MapNode } from './model.ts';

const ROW = 38;
const NODE_H = 30;
const APP_H = 52;
const PAD = 18;
const GROUP_GAP = 30;

type Focus = { type: 'app' | 'node'; id: string };

function Glyph({ kind }: { kind: MapNode['kind'] }) {
  if (kind === 'server') {
    return (
      <svg className={styles.glyph} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M6 2v3M10 2v3M4.5 5h7v3a3.5 3.5 0 0 1-7 0V5ZM8 11.5V14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'bundle') {
    return (
      <svg className={styles.glyph} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M2.5 5.5 8 2.5l5.5 3L8 8.5l-5.5-3ZM2.5 8.5 8 11.5l5.5-3M2.5 11 8 14l5.5-3" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className={styles.glyph} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M4 2.5h5.5L12 5v8.5H4v-11ZM9.5 2.5V5H12M6 8h4M6 10.5h4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Can this node be handed to another app at all? Bundles and app-internal servers cannot. */
function isPortable(node: MapNode): boolean {
  if (node.kind === 'skill') return node.skills.some((skill) => skill.scope === 'user');
  if (node.kind === 'server') return portableServer(node.servers[0]);
  return false;
}

function connectRequest(node: MapNode, app: string): ActionRequest | undefined {
  if (node.kind === 'skill') {
    const skill = node.skills.find((item) => item.scope === 'user') ?? node.skills[0];
    return { type: 'skill.connect', skillId: skill.id, app };
  }
  if (node.kind === 'server') {
    // Prefer a copy the user declared themselves: it is the one that carries their credentials.
    const server = node.servers.find((item) => item.origin.kind !== 'plugin') ?? node.servers[0];
    return { type: 'mcp.connect', serverId: server.id, app };
  }
  return undefined;
}

function disconnectRequest(node: MapNode, app: string): ActionRequest | undefined {
  if (node.kind === 'skill') {
    const skill = node.skills.find((item) => item.app === app && item.scope === 'user') ?? node.skills.find((item) => item.app === app);
    return skill ? { type: 'skill.disconnect', skillId: skill.id } : undefined;
  }
  if (node.kind === 'server') {
    const server = node.servers.find((item) => item.app === app && item.origin.kind !== 'plugin') ?? node.servers.find((item) => item.app === app);
    return server ? { type: 'mcp.disconnect', serverId: server.id } : undefined;
  }
  return undefined;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1100);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(760, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function ConnectionMap() {
  const { snapshot, status, act } = useShell();
  const model = useMemo(() => buildMap(snapshot), [snapshot]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ node: string; x: number; y: number }>();
  const [hoverLink, setHoverLink] = useState<MapLink>();
  const [view, setView] = useState<MapView>(DEFAULT_MAP_VIEW);
  const [tab, setTab] = useState<'assistant' | 'selected' | 'view'>('assistant');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [hover, setHover] = useState<Focus>();
  const [selected, setSelected] = useState<Focus>();
  const [ref, width] = useWidth();

  const visible = useMemo(() => {
    const needle = view.query.trim().toLowerCase();
    const uses = (node: MapNode) => Math.max(0, ...node.skills.map((skill) => skill.usageCount ?? 0));
    const kept = model.nodes.filter((node) => {
      if (view.kind === 'skills' && node.side !== 'left') return false;
      if (view.kind === 'servers' && node.side !== 'right') return false;
      if (view.shared && node.apps.length < 2) return false;
      if (!view.bundles && node.kind === 'bundle') return false;
      if (!view.projects && node.kind === 'skill' && node.skills.every((skill) => skill.scope === 'project')) return false;
      if (view.app && !node.apps.includes(view.app)) return false;
      if (!needle) return true;
      if (node.label.toLowerCase().includes(needle)) return true;
      return node.skills.some((skill) => skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle) || skill.tags.includes(needle));
    });
    if (view.sort === 'default') return kept;
    // Bundles stay below the individual skills whatever the order.
    const rank = (node: MapNode) => (node.kind === 'bundle' ? 1 : 0);
    const compare: Record<Exclude<MapView['sort'], 'default'>, (a: MapNode, b: MapNode) => number> = {
      name: (a, b) => a.label.localeCompare(b.label),
      usage: (a, b) => uses(b) - uses(a) || b.apps.length - a.apps.length || a.label.localeCompare(b.label),
      shared: (a, b) => b.apps.length - a.apps.length || a.label.localeCompare(b.label),
    };
    return [...kept].sort((a, b) => rank(a) - rank(b) || compare[view.sort as 'name'](a, b));
  }, [model, view]);

  const left = visible.filter((node) => node.side === 'left');
  const right = visible.filter((node) => node.side === 'right');
  const firstBundle = left.findIndex((node) => node.kind === 'bundle');
  const leftHeight = left.length * ROW + (firstBundle > 0 ? GROUP_GAP : 0);
  const inner = Math.max(leftHeight, right.length * ROW, model.apps.length * (APP_H + 14), 200);
  const height = inner + PAD * 2;

  const colW = Math.min(330, Math.round(width * 0.33));
  const appW = Math.min(230, Math.round(width * 0.22));
  const appX = Math.round(width / 2 - appW / 2);

  const nodeY = new Map<string, number>();
  left.forEach((node, index) => {
    const gap = firstBundle > 0 && index >= firstBundle ? GROUP_GAP : 0;
    nodeY.set(node.id, PAD + (inner - leftHeight) / 2 + index * ROW + gap + ROW / 2);
  });
  right.forEach((node, index) => nodeY.set(node.id, PAD + (inner - right.length * ROW) / 2 + index * ROW + ROW / 2));
  const appY = new Map<string, number>();
  model.apps.forEach((app, index) => appY.set(app.id, PAD + (inner * (index + 0.5)) / model.apps.length));

  const visibleIds = new Set(visible.map((node) => node.id));
  const links = model.links.filter((link) => visibleIds.has(link.node));
  const focus: Focus | undefined = drag ? { type: 'node', id: drag.node } : hoverLink ? { type: 'node', id: hoverLink.node } : hover ?? selected;
  const activeLinks = !focus
    ? []
    : hoverLink && !drag
      ? links.filter((link) => link.node === hoverLink.node && link.app === hoverLink.app)
      : links.filter((link) => (focus.type === 'app' ? link.app === focus.id : link.node === focus.id));
  const activeNodes = new Set(activeLinks.map((link) => link.node));
  const activeApps = new Set(activeLinks.map((link) => link.app));
  if (focus?.type === 'app') activeApps.add(focus.id);
  if (focus?.type === 'node') activeNodes.add(focus.id);

  const dragNode = drag ? model.nodes.find((node) => node.id === drag.node) : undefined;

  // While a connection is being dragged, follow the pointer and finish on whatever app it is released over.
  useEffect(() => {
    if (!drag) return;
    const source = model.nodes.find((node) => node.id === drag.node);
    function onMove(event: PointerEvent) {
      const box = canvasRef.current?.getBoundingClientRect();
      if (box) setDrag((current) => (current ? { ...current, x: event.clientX - box.left, y: event.clientY - box.top } : current));
    }
    function onUp(event: PointerEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-app-id]');
      const appId = target?.getAttribute('data-app-id');
      setDrag(undefined);
      if (!source || !appId || source.apps.includes(appId)) return;
      const request = connectRequest(source, appId);
      if (request) act([request], { title: `Connect ${source.label}`, preselect: true });
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrag(undefined);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
    // The listeners only need to be set up once per drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.node]);

  function startDrag(event: React.PointerEvent, node: MapNode) {
    event.preventDefault();
    const box = canvasRef.current?.getBoundingClientRect();
    if (box) setDrag({ node: node.id, x: event.clientX - box.left, y: event.clientY - box.top });
  }

  function cut(link: MapLink) {
    const node = model.nodes.find((item) => item.id === link.node);
    const request = node ? disconnectRequest(node, link.app) : undefined;
    const app = model.apps.find((item) => item.id === link.app);
    if (node && request) act([request], { title: `Disconnect ${node.label} from ${app?.name ?? link.app}`, preselect: true });
  }

  function toggle(next: Focus) {
    const same = selected && selected.type === next.type && selected.id === next.id;
    setSelected(same ? undefined : next);
    if (!same) setTab('selected');
  }

  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const selectedNode = selected?.type === 'node' ? nodeById.get(selected.id) : undefined;
  const selectedApp = selected?.type === 'app' ? model.apps.find((app) => app.id === selected.id) : undefined;

  const changed = JSON.stringify(view) !== JSON.stringify(DEFAULT_MAP_VIEW);

  if (model.apps.length === 0) {
    return <div className="card empty">No AI apps were found on this computer.</div>;
  }

  return (
    <div>
      <div className={styles.controls}>
        <input
          className={`input ${styles.search}`}
          type="search"
          placeholder="Find a skill or server"
          aria-label="Find a skill or server"
          value={view.query}
          onChange={(event) => setView({ ...view, query: event.target.value })}
        />
        {changed ? (
          <button type="button" className="btn" onClick={() => setView(DEFAULT_MAP_VIEW)}>
            Reset view
          </button>
        ) : null}
        <div className={styles.legend} aria-hidden="true">
          {status.canWrite ? (
            <span className={styles.hint}>
              <Arrow size={10} /> drag an arrow onto an app · click a line to disconnect
            </span>
          ) : null}
          <span>
            <svg width="26" height="6">
              <path d="M0 3h26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            inside a project
          </span>
        </div>
      </div>

      <div className={panel.layout}>
      <div className={`card ${styles.scroller}`} ref={ref}>
        <div className={styles.heads}>
          <div className={styles.head} style={{ left: 12 }}>
            Skills <span>· instructions an app loads</span>
          </div>
          <div className={styles.head} style={{ left: appX }}>
            AI apps <span>· on this computer</span>
          </div>
          <div className={styles.head} style={{ left: width - colW }}>
            MCP servers <span>· tools an app can reach</span>
          </div>
        </div>
        <div className={`${styles.canvas} ${drag ? styles.dragging : ''}`} style={{ height }} ref={canvasRef} onMouseLeave={() => setHover(undefined)}>
          <svg className={styles.links} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {links.map((link) => {
              const node = nodeById.get(link.node);
              const y1 = nodeY.get(link.node);
              const y2 = appY.get(link.app);
              if (!node || y1 === undefined || y2 === undefined) return null;
              const fromLeft = node.side === 'left';
              const x1 = fromLeft ? colW - 12 : width - colW + 12;
              const x2 = fromLeft ? appX : appX + appW;
              const bend = (x2 - x1) * 0.5;
              const isActive = Boolean(focus) && activeLinks.includes(link);
              const className = [styles.link, isActive ? styles.linkActive : '', focus && !isActive ? styles.linkDim : ''].join(' ');
              const d = `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
              const cuttable = status.canWrite && node.kind !== 'bundle' && !drag;
              const isCutting = hoverLink === link && cuttable;
              return (
                <g key={`${link.node}>${link.app}`}>
                  <path
                    className={`${className} ${isCutting ? styles.linkCut : ''}`}
                    d={d}
                    stroke={appColor(link.app)}
                    strokeDasharray={link.projectOnly ? '5 4' : undefined}
                  />
                  {cuttable ? (
                    <path
                      className={styles.linkHit}
                      d={d}
                      onMouseEnter={() => setHoverLink(link)}
                      onMouseLeave={() => setHoverLink((current) => (current === link ? undefined : current))}
                      onClick={() => cut(link)}
                    >
                      <title>Click to disconnect</title>
                    </path>
                  ) : null}
                  {isCutting ? (
                    <g transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2})`} className={styles.cutBadge}>
                      <circle r="9" />
                      <path d="M-3.5 -3.5 3.5 3.5M3.5 -3.5 -3.5 3.5" />
                    </g>
                  ) : null}
                </g>
              );
            })}
            {drag && dragNode ? (
              <path
                className={styles.dragLine}
                d={`M${dragNode.side === 'left' ? colW - 12 : width - colW + 12} ${nodeY.get(dragNode.id) ?? 0} L${drag.x} ${drag.y}`}
              />
            ) : null}
          </svg>

          {firstBundle > 0 ? (
            <div className={styles.groupLabel} style={{ left: 14, top: (nodeY.get(left[firstBundle].id) ?? 0) - ROW / 2 - 19 }}>
              Came with a plugin or the app
            </div>
          ) : null}

          {visible.map((node) => {
            const y = nodeY.get(node.id) ?? 0;
            const isSelected = selected?.type === 'node' && selected.id === node.id;
            const className = [
              styles.node,
              node.side === 'left' ? styles.nodeLeft : styles.nodeRight,
              node.kind === 'bundle' ? styles.bundle : '',
              activeNodes.has(node.id) ? styles.nodeActive : '',
              isSelected ? styles.nodeSelected : '',
              focus && !activeNodes.has(node.id) ? styles.nodeDim : '',
            ].join(' ');
            const draggable = status.canWrite && isPortable(node) && model.apps.some((app) => !node.apps.includes(app.id));
            return (
              <Fragment key={node.id}>
              <button
                type="button"
                className={className}
                style={{ top: y - NODE_H / 2, left: node.side === 'left' ? 12 : width - colW + 12, width: colW - 24 }}
                onMouseEnter={() => setHover({ type: 'node', id: node.id })}
                onFocus={() => setHover({ type: 'node', id: node.id })}
                onBlur={() => setHover(undefined)}
                onClick={() => toggle({ type: 'node', id: node.id })}
                aria-pressed={isSelected}
                title={node.label}
              >
                <Glyph kind={node.kind} />
                <span className={styles.nodeLabel}>{node.label}</span>
                {node.hint ? <span className={styles.nodeHint}>{node.hint}</span> : null}
              </button>
              {draggable ? (
                <span
                  className={`${styles.handle} ${activeNodes.has(node.id) ? styles.handleOn : ''}`}
                  style={{ top: y - 10, left: (node.side === 'left' ? colW - 12 : width - colW + 12) - 10 }}
                  onPointerDown={(event) => startDrag(event, node)}
                  onMouseEnter={() => setHover({ type: 'node', id: node.id })}
                  title="Drag onto an app to connect"
                  aria-hidden="true"
                >
                  <Arrow size={10} flip={node.side === 'right'} />
                </span>
              ) : null}
              </Fragment>
            );
          })}

          {model.apps.map((app) => {
            const y = appY.get(app.id) ?? 0;
            const isSelected = selected?.type === 'app' && selected.id === app.id;
            const isDropTarget = Boolean(dragNode) && !dragNode!.apps.includes(app.id);
            const className = [
              styles.node,
              styles.app,
              activeApps.has(app.id) ? styles.nodeActive : '',
              isSelected ? styles.nodeSelected : '',
              isDropTarget ? styles.dropTarget : '',
              focus && !activeApps.has(app.id) && !isDropTarget ? styles.nodeDim : '',
            ].join(' ');
            return (
              <button
                key={app.id}
                type="button"
                data-app-id={app.id}
                className={className}
                style={{ top: y - APP_H / 2, left: appX, width: appW }}
                onMouseEnter={() => setHover({ type: 'app', id: app.id })}
                onFocus={() => setHover({ type: 'app', id: app.id })}
                onBlur={() => setHover(undefined)}
                onClick={() => toggle({ type: 'app', id: app.id })}
                aria-pressed={isSelected}
              >
                <AppMark snapshot={snapshot} appId={app.id} size={30} />
                <span className={styles.appBody}>
                  <span className={styles.appName} style={{ display: 'block' }}>
                    {app.name}
                  </span>
                  <span className={styles.appMeta} style={{ display: 'block' }}>
                    {app.readable === 'none' ? 'setup lives in the cloud' : `${app.counts.skills} skills · ${app.counts.mcp} servers`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

        <aside className={panel.panel} aria-label="Map tools">
          <div className={panel.tabs} role="tablist">
            <button type="button" role="tab" className={panel.tab} aria-selected={tab === 'assistant'} onClick={() => setTab('assistant')}>
              Assistant <span className={panel.tabTag}>AI</span>
            </button>
            <button type="button" role="tab" className={panel.tab} aria-selected={tab === 'selected'} onClick={() => setTab('selected')}>
              Selected
            </button>
            <button type="button" role="tab" className={panel.tab} aria-selected={tab === 'view'} onClick={() => setTab('view')}>
              View
            </button>
          </div>

          {tab === 'assistant' ? (
            <div className={`${panel.body} ${panel.bodyFlush}`}>
              <MapAssistant turns={turns} setTurns={setTurns} onView={(next) => setView((current) => ({ ...current, ...next }))} onResetView={() => setView(DEFAULT_MAP_VIEW)} />
            </div>
          ) : null}

          {tab === 'selected' ? (
            <div className={`${panel.body} ${styles.inPanel}`} aria-live="polite">
              {selectedNode ? <NodeDetail node={selectedNode} snapshot={snapshot} apps={model.apps} /> : null}
              {selectedApp ? <AppDetail app={selectedApp} snapshot={snapshot} /> : null}
              {!selectedNode && !selectedApp ? <Primer /> : null}
            </div>
          ) : null}

          {tab === 'view' ? (
            <div className={panel.body}>
              <div className={panel.controls}>
                <div className={panel.control}>
                  <span>Show</span>
                  <div className={panel.seg} role="group" aria-label="What to show">
                    {(['all', 'skills', 'servers'] as const).map((kind) => (
                      <button key={kind} type="button" aria-pressed={view.kind === kind} onClick={() => setView({ ...view, kind })}>
                        {{ all: 'Everything', skills: 'Skills', servers: 'MCP servers' }[kind]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={panel.control}>
                  <span>Order</span>
                  <div className={panel.seg} role="group" aria-label="Order">
                    {(['default', 'name', 'usage', 'shared'] as const).map((sort) => (
                      <button key={sort} type="button" aria-pressed={view.sort === sort} onClick={() => setView({ ...view, sort })}>
                        {{ default: 'By app', name: 'A to Z', usage: 'Most used', shared: 'Most shared' }[sort]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={panel.control}>
                  <label htmlFor="map-focus-app">Only what this app has</label>
                  <select id="map-focus-app" className="select" value={view.app} onChange={(event) => setView({ ...view, app: event.target.value })}>
                    <option value="">All apps</option>
                    {model.apps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className={panel.switch}>
                  <input type="checkbox" checked={view.shared} onChange={(event) => setView({ ...view, shared: event.target.checked })} />
                  Only what two or more apps share
                </label>
                <label className={panel.switch}>
                  <input type="checkbox" checked={view.projects} onChange={(event) => setView({ ...view, projects: event.target.checked })} />
                  Skills inside projects
                </label>
                <label className={panel.switch}>
                  <input type="checkbox" checked={view.bundles} onChange={(event) => setView({ ...view, bundles: event.target.checked })} />
                  Skills from plugins and apps
                </label>
                <div className={panel.count}>
                  Showing {left.length} skills and {right.length} servers.
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Primer() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Hover to trace a connection. Drag the arrow on a skill or server onto an app to connect it, and click a line to disconnect it. You confirm every change before it happens. Click
        anything for details.
      </p>
      <div className={styles.primer}>
        <div>
          <h4>Skill</h4>
          <p>A folder of instructions. An app reads its short description all the time and opens the rest when a task matches.</p>
        </div>
        <div>
          <h4>MCP server</h4>
          <p>A connector. It gives an app access to a tool or service, such as GitHub, a database or your browser.</p>
        </div>
        <div>
          <h4>Plugin</h4>
          <p>A bundle that installs several skills and servers at once. Its skills are grouped into one dashed box.</p>
        </div>
      </div>
    </div>
  );
}

function NodeDetail({ node, snapshot, apps }: { node: MapNode; snapshot: HarnessSnapshot; apps: AppInfo[] }) {
  const { status, act } = useShell();
  const missing = apps.filter((app) => !node.apps.includes(app.id));
  const candidates = isPortable(node)
    ? missing.filter((app) => (node.kind === 'skill' ? app.userSkillDir : app.mcpAdd)).flatMap((app) => connectRequest(node, app.id) ?? [])
    : [];
  const readOnlyHint = status.canWrite ? undefined : 'Demo data is read-only';

  function connectOthers() {
    act(candidates, {
      title: `Connect ${node.label} to other apps`,
      intro: 'Tick the apps that should get it, or select all. Nothing has happened yet.',
      preselect: false,
    });
  }

  function disconnect(app: string) {
    const request = disconnectRequest(node, app);
    const name = apps.find((item) => item.id === app)?.name ?? app;
    if (request) act([request], { title: `Disconnect ${node.label} from ${name}`, preselect: true });
  }

  if (node.kind === 'server') {
    const server = node.servers[0];
    const needs = [...server.headerNames.map((name) => `${name} header`), ...server.envNames.slice(0, 6), ...(server.envNames.length > 6 ? [`${server.envNames.length - 6} more variables`] : [])];
    return (
      <div>
        <h3 className={styles.detailTitle}>
          {node.label} <span className="badge">MCP server</span>
        </h3>
        <div className={styles.detailGrid}>
          <div className={styles.stack}>
            <dl className={styles.kv}>
              <dt>How it runs</dt>
              <dd>{server.transport === 'stdio' ? 'A program started on this computer' : 'A remote service reached over the network'}</dd>
              <dt>{server.url ? 'Address' : 'Command'}</dt>
              <dd>
                <code>{server.url ?? server.command ?? 'unknown'}</code>
              </dd>
              {needs.length > 0 ? (
                <>
                  <dt>Needs</dt>
                  <dd>{needs.join(', ')} (values are never read)</dd>
                </>
              ) : null}
            </dl>
            <div>
              <h4>Connected to</h4>
              <ul className={styles.list}>
                {node.servers.map((item) => (
                  <li key={item.id} className={styles.row}>
                    <AppChip snapshot={snapshot} appId={item.app} />{' '}
                    <span>
                      {item.origin.kind === 'plugin' ? `through the ${item.origin.name} plugin` : `declared in ${item.source}`}
                      {item.enabled ? '' : ' (turned off)'}
                    </span>
                    {item.origin.kind !== 'plugin' && item.scope === 'user' ? (
                      <button type="button" className={`btn ${styles.small}`} disabled={!status.canWrite} title={readOnlyHint} onClick={() => disconnect(item.app)}>
                        Disconnect
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h4>Connect it to another app</h4>
            {candidates.length > 0 ? (
              <div className={styles.stack}>
                <p className="muted" style={{ margin: 0 }}>
                  Not connected to {missing.filter((app) => app.mcpAdd).map((app) => app.name).join(', ')}.
                </p>
                <div>
                  <button type="button" className="btn btn-primary" disabled={!status.canWrite} title={readOnlyHint} onClick={connectOthers}>
                    Choose apps to connect…
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {portableServer(server) ? 'Every app that can take it already has it.' : 'This server runs from inside one app, so it is not something to copy elsewhere.'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (node.kind === 'bundle') {
    const distinct = [...new Map(node.skills.map((skill) => [skill.key, skill])).values()];
    return (
      <div>
        <h3 className={styles.detailTitle}>
          {node.label} <span className="badge">{distinct.length} skills</span>
        </h3>
        <div className={styles.chips} style={{ marginBottom: 12 }}>
          {node.apps.map((app) => (
            <AppChip key={app} snapshot={snapshot} appId={app} />
          ))}
        </div>
        <ul className={styles.list}>
          {distinct.slice(0, 60).map((skill) => (
            <li key={skill.id}>
              <strong>{skill.name}</strong> <span>{clip(skill.description, 150)}</span>
            </li>
          ))}
        </ul>
        {distinct.length > 60 ? <p className="faint">And {distinct.length - 60} more. See the Skills tab for the full list.</p> : null}
      </div>
    );
  }

  const skill = node.skills[0];
  const portable = skill.scope === 'user';
  const uses = node.skills.find((item) => item.usageCount !== undefined)?.usageCount;
  return (
    <div>
      <h3 className={styles.detailTitle}>
        {node.label} <span className="badge">Skill</span>
        {skill.modelInvocable ? null : <span className="badge">manual only</span>}
      </h3>
      <p className="muted" style={{ margin: 0 }}>
        {skill.description || 'This skill has no description.'}
      </p>
      <div className={styles.detailGrid}>
        <div className={styles.stack}>
          <dl className={styles.kv}>
            <dt>Always-on cost</dt>
            <dd>about {skill.estTokens} tokens per session, per app</dd>
            {uses !== undefined ? (
              <>
                <dt>Used</dt>
                <dd>{uses} times in Claude Code</dd>
              </>
            ) : null}
          </dl>
          <div>
            <h4>Available in</h4>
            <ul className={styles.list}>
              {node.skills.map((item) => (
                <li key={item.id} className={styles.row}>
                  <AppChip snapshot={snapshot} appId={item.app} /> <span>{item.path}</span>
                  {item.scope === 'user' ? (
                    <button type="button" className={`btn ${styles.small}`} disabled={!status.canWrite} title={readOnlyHint} onClick={() => disconnect(item.app)}>
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <h4>Make it available to another app</h4>
          {candidates.length > 0 ? (
            <div className={styles.stack}>
              <p className="muted" style={{ margin: 0 }}>
                Not in {missing.filter((app) => app.userSkillDir).map((app) => app.name).join(', ')}.
              </p>
              <div>
                <button type="button" className="btn btn-primary" disabled={!status.canWrite} title={readOnlyHint} onClick={connectOthers}>
                  Choose apps to add it to…
                </button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {portable ? 'Every app with a skills folder already has it.' : 'This skill lives inside a project, so it stays with that project.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AppDetail({ app, snapshot }: { app: AppInfo; snapshot: HarnessSnapshot }) {
  const servers = snapshot.slices.mcp.servers.filter((server) => server.app === app.id);
  const packages = snapshot.slices.packages.items.filter((item) => item.app === app.id);
  const usage = snapshot.slices.usage.sources.find((source) => source.app === app.id);
  const tokens = alwaysOnTokens(snapshot, app.id);
  const kind = { cli: 'Command-line agent', desktop: 'Desktop app', ide: 'Code editor' }[app.kind];
  return (
    <div>
      <h3 className={styles.detailTitle}>
        <AppMark snapshot={snapshot} appId={app.id} size={26} />
        {app.name}{' '}
        <span className="badge">
          {kind} · {app.vendor}
        </span>
      </h3>
      {app.note ? (
        <p className="muted" style={{ margin: 0 }}>
          {app.note}
        </p>
      ) : null}
      <div className={styles.detailGrid}>
        <dl className={styles.kv}>
          <dt>Skills</dt>
          <dd>
            {app.counts.skills}
            {tokens > 0 ? `, about ${tokens.toLocaleString('en-US')} tokens of descriptions in every session` : ''}
          </dd>
          <dt>MCP servers</dt>
          <dd>{servers.length === 0 ? 'none found in local files' : servers.map((server) => server.name).join(', ')}</dd>
          <dt>Plugins</dt>
          <dd>{packages.length === 0 ? 'none' : packages.map((item) => `${item.name}${item.enabled ? '' : ' (off)'}`).join(', ')}</dd>
          <dt>Tokens</dt>
          <dd>
            {usage?.status === 'ok'
              ? `${formatTokens(usage.totals.total)} processed over ${usage.sessions} sessions`
              : usage?.note ?? 'No usage is recorded on this computer.'}
          </dd>
        </dl>
        <dl className={styles.kv}>
          <dt>Found at</dt>
          <dd>{app.evidence.join(', ')}</dd>
          {app.userSkillDir ? (
            <>
              <dt>Skills folder</dt>
              <dd>
                <code>{app.userSkillDir}</code>
              </dd>
            </>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export const feature: FeatureDescriptor = {
  id: 'map',
  title: 'Map',
  summary: 'Which app uses what. Drag an arrow onto an app to connect it.',
  order: 20,
  Component: ConnectionMap,
};
