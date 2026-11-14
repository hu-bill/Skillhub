import { describe, expect, it } from 'vitest';
import { looksSecret, namesOnly, REDACTED, redactArgs, redactCommand, redactUrl } from '../../collectors/redact.ts';

describe('redact', () => {
  it('drops credentials, query strings and secret path segments from URLs', () => {
    expect(redactUrl('https://user:pass@api.example.com/v1/mcp?key=abc#x')).toBe('https://api.example.com/v1/mcp?…');
    expect(redactUrl('https://hooks.example.com/services/T0AAAA1111BBBB2222cccc3333')).toBe(`https://hooks.example.com/services/${REDACTED}`);
    expect(redactUrl('not a url')).toBe(REDACTED);
  });

  it('redacts connection strings of any scheme', () => {
    expect(redactArgs(['postgresql://admin:s3cret@db.example.com/app'])).toEqual(['postgresql://db.example.com/app']);
    expect(redactArgs(['--dsn=redis://:pw@cache.example.com:6379/0'])).toEqual(['--dsn=redis://cache.example.com:6379/0']);
  });

  it('masks the value after a secret-named flag and inside --flag=value', () => {
    expect(redactArgs(['--api-key', 'abc123', '--port', '8080'])).toEqual(['--api-key', REDACTED, '--port', '8080']);
    expect(redactArgs(['--token=abc123', '--name=demo'])).toEqual([`--token=${REDACTED}`, '--name=demo']);
  });

  it('recognises bare credentials but leaves packages, files and flags alone', () => {
    expect(looksSecret('ghp_FAKEFAKEFAKEFAKEFAKE1234567890')).toBe(true);
    expect(looksSecret('sk-fake-desktop-token-0000000000')).toBe(true);
    expect(looksSecret('Bearer abc.def.ghi')).toBe(true);
    expect(looksSecret('@modelcontextprotocol/server-postgres')).toBe(false);
    expect(looksSecret('-y')).toBe(false);
    expect(looksSecret('server.mjs')).toBe(false);
    expect(redactCommand('npx', ['-y', '@scope/pkg', 'ghp_FAKEFAKEFAKEFAKEFAKE1234567890'])).toBe(`npx -y @scope/pkg ${REDACTED}`);
  });

  it('keeps only the names of env and header maps', () => {
    expect(namesOnly({ B_TOKEN: 'x', A_KEY: 'y' })).toEqual(['A_KEY', 'B_TOKEN']);
    expect(namesOnly(undefined)).toEqual([]);
    expect(namesOnly(['x'])).toEqual([]);
  });
});
