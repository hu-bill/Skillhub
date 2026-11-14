// Spine: the tags a skill can carry, and how a skill gets them.
// Tags are worked out from a skill's name and description by plain keyword matching. No model, no
// network: the same skill always gets the same tags, and the text is only ever read, never obeyed.

export interface Tag {
  id: string;
  label: string;
  /** What to search a registry for to find more of these. */
  query: string;
  keywords: string[];
}

export const TAGS: Tag[] = [
  { id: 'design', label: 'Design', query: 'design', keywords: ['design', 'ui', 'ux', 'visual', 'typography', 'aesthetic', 'figma', 'brand', 'layout', 'palette', 'interface', 'redesign'] },
  { id: 'frontend', label: 'Frontend', query: 'frontend', keywords: ['frontend', 'react', 'next', 'nextjs', 'vue', 'svelte', 'css', 'tailwind', 'shadcn', 'component', 'website', 'web', 'html', 'browser'] },
  { id: 'backend', label: 'Backend', query: 'backend api', keywords: ['backend', 'api', 'server', 'endpoint', 'fastapi', 'express', 'graphql', 'rest', 'webhook', 'functions', 'middleware', 'routing'] },
  { id: 'data', label: 'Data & SQL', query: 'postgres', keywords: ['postgres', 'sql', 'database', 'supabase', 'prisma', 'mongodb', 'redis', 'query', 'migration', 'storage', 'analytics', 'spreadsheet', 'xlsx', 'csv'] },
  { id: 'testing', label: 'Testing', query: 'testing', keywords: ['test', 'testing', 'tests', 'qa', 'playwright', 'jest', 'vitest', 'e2e', 'debug', 'debugging', 'verification', 'review'] },
  { id: 'docs', label: 'Docs & writing', query: 'docs', keywords: ['docs', 'document', 'documentation', 'docx', 'pdf', 'readme', 'markdown', 'writing', 'write', 'pptx', 'slides', 'presentation', 'presentations', 'report'] },
  { id: 'deploy', label: 'Deploy', query: 'deploy', keywords: ['deploy', 'deployment', 'deployments', 'vercel', 'docker', 'ci', 'cicd', 'kubernetes', 'aws', 'cloud', 'terraform', 'hosting', 'release', 'env'] },
  { id: 'security', label: 'Security', query: 'security', keywords: ['security', 'auth', 'authentication', 'secret', 'secrets', 'vulnerability', 'permissions', 'oauth', 'audit'] },
  { id: 'agents', label: 'AI & agents', query: 'agent', keywords: ['agent', 'agents', 'mcp', 'llm', 'prompt', 'prompts', 'ai', 'sdk', 'claude', 'openai', 'gemini', 'skill', 'skills', 'subagent', 'chat'] },
  { id: 'media', label: 'Media', query: 'image', keywords: ['image', 'images', 'imagegen', 'video', 'audio', 'canvas', 'animation', 'motion', 'photo', 'illustration', 'media'] },
  { id: 'mobile', label: 'Mobile', query: 'mobile', keywords: ['mobile', 'ios', 'android', 'swift', 'swiftui', 'flutter', 'expo', 'native'] },
  { id: 'workflow', label: 'Workflow', query: 'workflow', keywords: ['workflow', 'git', 'commit', 'plan', 'planning', 'automation', 'automate', 'schedule', 'loop', 'productivity', 'github', 'pr'] },
];

const BY_ID = new Map(TAGS.map((tag) => [tag.id, tag]));

export function tagLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Up to `max` tags, best match first. A hit in the name counts three times a hit in the description. */
export function tagsFor(name: string, description: string, max = 3): string[] {
  const nameWords = new Set(words(name));
  const bodyWords = new Set(words(description));
  const scored: { id: string; score: number }[] = [];
  for (const tag of TAGS) {
    let score = 0;
    for (const keyword of tag.keywords) {
      if (nameWords.has(keyword)) score += 3;
      else if (bodyWords.has(keyword)) score += 1;
    }
    if (score > 0) scored.push({ id: tag.id, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((entry) => entry.id);
}
