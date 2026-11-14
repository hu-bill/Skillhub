// Spine: secret redaction. Everything a collector emits about a command, URL, env or header
// goes through here first, so raw credentials never reach an HTTP response or the browser.

const SECRET_NAME = /(key|token|secret|passw(or)?d|auth|credential|bearer|cookie|session|signature)/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /^(sk|pk|rk|xox[abprs]|gh[pousr]|github_pat|glpat|AIza|ya29|AKIA|eyJ)[-_A-Za-z0-9.]{8,}/,
  /^Bearer\s+\S+/i,
  /^Basic\s+\S+/i,
];

export const REDACTED = '‹redacted›';

/** Any `scheme://` value: http(s) endpoints, but also connection strings such as `postgresql://user:pass@host/db`. */
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** True when a bare value looks like a credential rather than a flag, path or package name. */
export function looksSecret(value: string): boolean {
  if (SECRET_VALUE_PATTERNS.some((re) => re.test(value))) return true;
  // Long, unbroken, mixed-class strings: API keys, JWTs, hex digests.
  if (value.length >= 24 && /^[A-Za-z0-9+/=_.-]+$/.test(value) && !value.includes('/')) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((re) => re.test(value)).length;
    const looksLikePackage = /^@?[a-z0-9-]+(\/[a-z0-9-]+)?(@[\w.-]+)?$/.test(value);
    const looksLikeFile = /\.[a-z]{1,5}$/.test(value);
    if (classes >= 2 && !looksLikePackage && !looksLikeFile) return true;
  }
  return false;
}

export function isSecretName(name: string): boolean {
  return SECRET_NAME.test(name);
}

/** Keep origin + path. Drop userinfo, query string and fragment, which is where credentials hide. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname
      .split('/')
      .map((segment) => (looksSecret(segment) ? REDACTED : segment))
      .join('/');
    const suffix = url.search ? '?…' : '';
    return `${url.protocol}//${url.host}${path}${suffix}`;
  } catch {
    return REDACTED;
  }
}

/** Redact a launch command: secret-looking args, `--flag=value` and the value after a secret-named flag. */
export function redactArgs(args: string[]): string[] {
  const out: string[] = [];
  let maskNext = false;
  for (const arg of args) {
    if (maskNext) {
      out.push(REDACTED);
      maskNext = false;
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0) {
      const name = arg.slice(0, eq);
      const value = arg.slice(eq + 1);
      if (isSecretName(name) || looksSecret(value)) {
        out.push(`${name}=${REDACTED}`);
        continue;
      }
      if (URL_LIKE.test(value)) {
        out.push(`${name}=${redactUrl(value)}`);
        continue;
      }
    }
    if (arg.startsWith('-') && isSecretName(arg)) {
      out.push(arg);
      maskNext = eq < 0;
      continue;
    }
    if (URL_LIKE.test(arg)) {
      out.push(redactUrl(arg));
      continue;
    }
    out.push(looksSecret(arg) ? REDACTED : arg);
  }
  return out;
}

export function redactCommand(command: string, args: string[] = []): string {
  return [command, ...redactArgs(args)].join(' ').trim();
}

/** Names only: the values of env maps and header maps are dropped entirely. */
export function namesOnly(map: unknown): string[] {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
  return Object.keys(map as Record<string, unknown>).sort();
}
