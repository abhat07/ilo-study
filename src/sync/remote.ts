/**
 * Where the synced copy lives. The app talks to it only through this small interface,
 * so the GitHub implementation can be swapped (and a fake one is used in tests).
 */
export interface RemoteFile {
  bytes: Uint8Array;
  sha: string;
}

export interface Remote {
  /** null when the file doesn't exist yet */
  get(path: string): Promise<RemoteFile | null>;
  /** sha = the version you read (null for a new file). Throws ConflictError if someone wrote in between. */
  put(path: string, bytes: Uint8Array, sha: string | null, message: string): Promise<string>;
  /** names of files in a folder ([] if it doesn't exist) */
  list(dir: string): Promise<string[]>;
}

export class ConflictError extends Error {}
export class RemoteAuthError extends Error {}

// ---------------- GitHub (private repo, fine-grained token with Contents: read & write) ----------------

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

export class GitHubRemote implements Remote {
  constructor(private repo: string, private token: string) {}

  private url(path: string) {
    return `https://api.github.com/repos/${this.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  private async req(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<Response> {
    const res = await fetch(this.url(path), {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: init.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new RemoteAuthError(
        res.status === 401 ? 'GitHub rejected the token (expired or wrong).' : 'The token cannot access this repository. Check it has Contents: Read and write for this repo.',
      );
    }
    return res;
  }

  async check(): Promise<{ private: boolean; canWrite: boolean }> {
    const res = await fetch(`https://api.github.com/repos/${this.repo}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (res.status === 401) throw new RemoteAuthError('GitHub rejected the token.');
    if (res.status === 404) throw new RemoteAuthError('Repository not found, or the token has no access to it.');
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);
    const j = await res.json();
    return { private: !!j.private, canWrite: !!j.permissions?.push };
  }

  async get(path: string): Promise<RemoteFile | null> {
    const meta = await this.req(path);
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`GitHub error ${meta.status}`);
    const j = await meta.json();
    const raw = await this.req(path, { raw: true });
    if (!raw.ok) throw new Error(`GitHub error ${raw.status}`);
    return { bytes: new Uint8Array(await raw.arrayBuffer()), sha: j.sha };
  }

  async put(path: string, bytes: Uint8Array, sha: string | null, message: string): Promise<string> {
    const res = await this.req(path, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64(bytes), ...(sha ? { sha } : {}) }),
    });
    if (res.status === 409 || res.status === 422) throw new ConflictError('The synced copy changed while syncing.');
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);
    return (await res.json()).content.sha;
  }

  async list(dir: string): Promise<string[]> {
    const res = await this.req(dir);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);
    const j = await res.json();
    return Array.isArray(j) ? j.map((e: { name: string }) => e.name) : [];
  }
}

/** In-memory remote for tests. */
export class MemoryRemote implements Remote {
  files = new Map<string, RemoteFile>();
  private n = 0;
  async get(path: string) {
    const f = this.files.get(path);
    return f ? { bytes: f.bytes.slice(), sha: f.sha } : null;
  }
  async put(path: string, bytes: Uint8Array, sha: string | null, _message?: string) {
    void _message;
    const cur = this.files.get(path);
    if ((cur?.sha ?? null) !== sha) throw new ConflictError('conflict');
    const next = `sha${++this.n}`;
    this.files.set(path, { bytes: bytes.slice(), sha: next });
    return next;
  }
  async list(dir: string) {
    return [...this.files.keys()].filter((k) => k.startsWith(dir + '/')).map((k) => k.slice(dir.length + 1));
  }
}
