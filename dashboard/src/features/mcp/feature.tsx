// Slice `mcp`: every distinct MCP server, how it is reached, which apps have it and what it needs.
// Commands and URLs arrive already redacted by the collector; values of secrets are never present.

import { Fragment, useMemo, useState } from 'react';
import { mcpAddCommand, portableServer } from '../../../shared/insights.ts';
import type { McpServer } from '../../../shared/schema.ts';
import { useShell, type FeatureDescriptor } from '../../shell/context.ts';
import { AppChip, Command, detectedApps } from '../../shell/ui.tsx';
import styles from './mcp.module.css';

function Servers() {
  const { snapshot } = useShell();
  const [open, setOpen] = useState<string>();
  const apps = detectedApps(snapshot);

  const groups = useMemo(() => {
    const byKey = new Map<string, McpServer[]>();
    for (const server of snapshot.slices.mcp.servers) byKey.set(server.key, [...(byKey.get(server.key) ?? []), server]);
    return [...byKey.entries()].sort((a, b) => new Set(b[1].map((s) => s.app)).size - new Set(a[1].map((s) => s.app)).size || a[1][0].name.localeCompare(b[1][0].name));
  }, [snapshot]);

  if (groups.length === 0) {
    return <div className="card empty">No MCP servers are declared in the local config of any app found here. Discover has a registry to search.</div>;
  }

  return (
    <div>
      <div className={`card ${styles.wrap}`}>
        <table className="grid">
          <thead>
            <tr>
              <th>Server</th>
              <th>How it is reached</th>
              <th>Connected to</th>
              <th>Needs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map(([key, servers]) => {
              const server = servers[0];
              const has = [...new Set(servers.map((item) => item.app))];
              const needs = [...server.headerNames.map((name) => `${name} header`), ...server.envNames];
              const missing = apps.filter((app) => !has.includes(app.id));
              const commands = portableServer(server)
                ? missing.map((app) => ({ app, command: mcpAddCommand(server, app) })).filter((entry): entry is { app: (typeof apps)[number]; command: string } => Boolean(entry.command))
                : [];
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <tr>
                    <td>
                      <div className={styles.name}>{server.name}</div>
                      <span className="badge">{server.transport === 'stdio' ? 'runs on this computer' : 'remote service'}</span>{' '}
                      {servers.every((item) => item.origin.kind === 'plugin') ? <span className="badge">from a plugin</span> : null}{' '}
                      {servers.some((item) => !item.enabled) ? <span className="badge">turned off somewhere</span> : null}
                    </td>
                    <td>
                      <code className={styles.endpoint}>{server.url ?? server.command ?? 'unknown'}</code>
                    </td>
                    <td>
                      <div className={styles.apps}>
                        {has.map((id) => (
                          <AppChip key={id} snapshot={snapshot} appId={id} />
                        ))}
                      </div>
                    </td>
                    <td className="muted">{needs.length === 0 ? 'nothing' : needs.length <= 2 ? needs.join(', ') : `${needs.length} settings`}</td>
                    <td>
                      <button type="button" className={styles.expand} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : key)}>
                        {isOpen ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className={styles.detail}>
                      <td colSpan={5}>
                        <div className={styles.stack}>
                          <div>
                            <strong>Declared in</strong>
                            <ul>
                              {servers.map((item) => (
                                <li key={item.id}>
                                  {item.origin.kind === 'plugin' ? `the ${item.origin.name} plugin` : item.source} <span className="faint">({item.scope} scope)</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          {needs.length > 0 ? (
                            <div>
                              <strong>Needs these set</strong> <span className="faint">(names only, values are never read)</span>
                              <div className="muted">{needs.join(', ')}</div>
                            </div>
                          ) : null}
                          {commands.length > 0 ? (
                            <div className={styles.stack}>
                              <strong>Connect it to another app</strong>
                              {commands.map((entry) => (
                                <Command key={entry.app.id} label={entry.app.name} command={entry.command} />
                              ))}
                            </div>
                          ) : (
                            <div className="muted">
                              {portableServer(server) ? 'Every app that can take it already has it.' : 'It runs from inside one app, so there is nothing to copy to the others.'}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const feature: FeatureDescriptor = {
  id: 'mcp',
  title: 'MCP',
  summary: 'Connectors that let an AI app use a tool or service.',
  order: 30,
  Component: Servers,
};
