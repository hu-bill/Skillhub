// Slice `map`: turns the snapshot into the graph the connection map draws.
// Apps sit in the middle; skills hang off the left, MCP servers off the right. A skill or server
// used by several apps is one node with several links, which is the whole point of the map.

import type { AppInfo, HarnessSnapshot, McpServer, SkillItem } from '../../../shared/schema.ts';

export type NodeKind = 'skill' | 'bundle' | 'server';

export interface MapNode {
  id: string;
  kind: NodeKind;
  side: 'left' | 'right';
  label: string;
  /** Short qualifier under the label, e.g. "plugin · 25 skills". */
  hint: string;
  /** App ids this node is linked to, in app order. */
  apps: string[];
  skills: SkillItem[];
  servers: McpServer[];
}

export interface MapLink {
  node: string;
  app: string;
  /** Project-scoped links are drawn dashed: they only exist inside this repository. */
  projectOnly: boolean;
}

export interface MapModel {
  apps: AppInfo[];
  nodes: MapNode[];
  links: MapLink[];
}

function bundleLabel(skill: SkillItem, apps: Map<string, AppInfo>): { id: string; label: string } {
  if (skill.origin.kind === 'plugin') return { id: `bundle:plugin:${skill.origin.name}`, label: `${skill.origin.name} plugin` };
  return { id: `bundle:builtin:${skill.app}`, label: `Built into ${apps.get(skill.app)?.name ?? skill.app}` };
}

export function buildMap(snapshot: HarnessSnapshot): MapModel {
  const apps = snapshot.slices.apps.items.filter((app) => app.detected);
  const appIndex = new Map(apps.map((app, index) => [app.id, index]));
  const appById = new Map(apps.map((app) => [app.id, app]));
  const nodes = new Map<string, MapNode>();

  function ensure(id: string, kind: NodeKind, side: 'left' | 'right', label: string): MapNode {
    let node = nodes.get(id);
    if (!node) {
      node = { id, kind, side, label, hint: '', apps: [], skills: [], servers: [] };
      nodes.set(id, node);
    }
    return node;
  }

  for (const skill of snapshot.slices.skills.items) {
    if (!appIndex.has(skill.app)) continue;
    const individual = skill.origin.kind === 'user' || skill.origin.kind === 'shared' || skill.origin.kind === 'project';
    if (individual) {
      ensure(`skill:${skill.key}`, 'skill', 'left', skill.name).skills.push(skill);
    } else {
      const bundle = bundleLabel(skill, appById);
      ensure(bundle.id, 'bundle', 'left', bundle.label).skills.push(skill);
    }
  }
  for (const server of snapshot.slices.mcp.servers) {
    if (!appIndex.has(server.app)) continue;
    ensure(`server:${server.key}`, 'server', 'right', server.name).servers.push(server);
  }

  const links: MapLink[] = [];
  for (const node of nodes.values()) {
    const members: { app: string; scope: string }[] = [...node.skills, ...node.servers];
    const perApp = new Map<string, boolean>();
    for (const member of members) {
      const projectOnly = member.scope === 'project' || member.scope === 'local';
      perApp.set(member.app, (perApp.get(member.app) ?? true) && projectOnly);
    }
    node.apps = [...perApp.keys()].sort((a, b) => (appIndex.get(a) ?? 0) - (appIndex.get(b) ?? 0));
    for (const [app, projectOnly] of perApp) links.push({ node: node.id, app, projectOnly });

    if (node.kind === 'skill') {
      const projects = [...new Set(node.skills.map((skill) => skill.project).filter((name): name is string => Boolean(name)))];
      const projectOnly = node.skills.every((skill) => skill.scope === 'project');
      node.hint = projectOnly
        ? `in ${projects[0] ?? 'a project'}${projects.length > 1 ? ` +${projects.length - 1}` : ''}`
        : node.apps.length > 1
          ? `shared by ${node.apps.length} apps`
          : '';
    } else if (node.kind === 'bundle') {
      const distinct = new Set(node.skills.map((skill) => skill.key)).size;
      node.hint = `${distinct} skill${distinct === 1 ? '' : 's'}`;
    } else {
      const first = node.servers[0];
      const viaPlugin = node.servers.every((server) => server.origin.kind === 'plugin');
      node.hint = [first.transport === 'stdio' ? 'runs locally' : 'remote', viaPlugin ? 'via plugin' : '', node.apps.length > 1 ? `${node.apps.length} apps` : '']
        .filter(Boolean)
        .join(' · ');
    }
  }

  // Order each column by the first app a node attaches to, so links cross as little as possible.
  const rank: Record<NodeKind, number> = { skill: 0, bundle: 1, server: 0 };
  const ordered = [...nodes.values()].sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      (appIndex.get(a.apps[0]) ?? 0) - (appIndex.get(b.apps[0]) ?? 0) ||
      b.apps.length - a.apps.length ||
      a.label.localeCompare(b.label),
  );
  return { apps, nodes: ordered, links };
}
