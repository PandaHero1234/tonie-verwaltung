// Schlanker Client für die GitHub-REST-API (nur was die App braucht).
// Das Token verlässt den Browser ausschließlich in Richtung api.github.com.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

export function b64encodeBytes(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
export const b64encodeText = (text) => b64encodeBytes(new TextEncoder().encode(text));
export function b64decodeText(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHub {
  constructor({ owner, repo, branch = 'main', token }) {
    Object.assign(this, { owner, repo, branch, token });
  }

  async request(method, path, { body, accept = 'application/vnd.github+json', raw = false } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (await res.json()).message || msg;
      } catch {
        /* keine JSON-Antwort */
      }
      throw new GitHubError(res.status, explain(res.status, msg));
    }
    if (res.status === 204) return null;
    return raw ? res : res.json();
  }

  get repoPath() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  getRepo() {
    return this.request('GET', this.repoPath);
  }

  /** Datei als Text (beliebige Größe bis 100 MB). */
  async getText(path) {
    const res = await this.request('GET', `${this.repoPath}/contents/${encPath(path)}?ref=${encodeURIComponent(this.branch)}`, {
      accept: 'application/vnd.github.raw+json',
      raw: true,
    });
    return res.text();
  }

  async getJson(path) {
    return JSON.parse(await this.getText(path));
  }

  /** Datei mit SHA (für anschließendes Überschreiben), max. 1 MB. */
  async getFile(path) {
    try {
      const r = await this.request('GET', `${this.repoPath}/contents/${encPath(path)}?ref=${encodeURIComponent(this.branch)}`);
      return { sha: r.sha, text: b64decodeText(r.content || '') };
    } catch (e) {
      if (e.status === 404) return { sha: null, text: null };
      throw e;
    }
  }

  async putFile(path, base64, message, sha) {
    return this.request('PUT', `${this.repoPath}/contents/${encPath(path)}`, {
      body: { message, content: base64, branch: this.branch, ...(sha ? { sha } : {}) },
    });
  }

  async fileSha(path) {
    return (await this.getFile(path)).sha;
  }

  dispatchWorkflow(file) {
    return this.request('POST', `${this.repoPath}/actions/workflows/${encodeURIComponent(file)}/dispatches`, {
      body: { ref: this.branch },
    });
  }

  async latestRun(file) {
    const r = await this.request(
      'GET',
      `${this.repoPath}/actions/workflows/${encodeURIComponent(file)}/runs?per_page=1&branch=${encodeURIComponent(this.branch)}`,
    );
    return r.workflow_runs?.[0] || null;
  }
}

function explain(status, msg) {
  if (status === 401) return 'Token ungültig oder abgelaufen (401).';
  if (status === 403 && /rate limit/i.test(msg)) return 'GitHub-Rate-Limit erreicht – bitte später erneut versuchen.';
  if (status === 403) return `Keine Berechtigung (403): ${msg}`;
  if (status === 404) return 'Nicht gefunden (404) – stimmen Owner, Repo, Branch und Token-Zugriff?';
  if (status === 409) return 'Konflikt (409) – die Datei wurde zwischenzeitlich geändert.';
  return `${status}: ${msg}`;
}
