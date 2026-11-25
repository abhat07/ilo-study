import { useState } from 'preact/hooks';
import { GitHubRemote } from '../sync/remote';
import { syncNow, syncSettings } from '../sync/sync';
import { useSync } from './common';
import { isDemo } from '../mode';

/** Pre-filled fine-grained token form (GitHub ignores any parameter it doesn't support). */
const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=ILO%20Study%20sync&description=Lets%20ILO%20Study%20sync%20between%20my%20devices&expires_in=365&contents=write';

export function SyncCard() {
  const status = useSync();
  const [repo, setRepo] = useState(syncSettings.repo() || '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const connected = syncSettings.configured();

  const connect = async () => {
    setErr('');
    const r = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return setErr('Repository should look like username/ilo-study-data.');
    const t = token.trim();
    if (!t.startsWith('github_pat_') && !t.startsWith('ghp_')) return setErr('That does not look like a GitHub token (it should start with github_pat_).');
    setBusy(true);
    try {
      const info = await new GitHubRemote(r, t).check();
      if (!info.private) return setErr('That repository is public. Use a private one so your lecture material and progress stay private.');
      if (!info.canWrite) return setErr('The token can read but not write. Give it Contents: Read and write.');
      syncSettings.save(r, t);
      setToken('');
      await syncNow('connected');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (isDemo()) {
    return (
      <div class="card">
        <h2>🔄 Sync across devices</h2>
        <p class="small muted">Off in demo mode: demo data stays on this device and never touches your synced copy.</p>
      </div>
    );
  }

  if (connected) {
    const last = status.last
      ? `Last synced ${new Date(status.last).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
      : 'Not synced yet.';
    return (
      <div class="card">
        <h2>🔄 Sync across devices</h2>
        <p class="small">
          Connected to <code>{syncSettings.repo()}</code> on this {syncSettings.device()}. {status.state === 'syncing' ? 'Syncing…' : last}
          {status.detail && status.state === 'idle' ? ` (${status.detail})` : ''}
        </p>
        {status.state === 'error' && <div class="err small" style={{ marginBottom: '8px' }}>{status.error}</div>}
        <p class="muted small">
          Syncs automatically when you open the app, after you study or upload, and every 5 minutes. Your API key is not synced: add it on each device.
        </p>
        <div class="row">
          <button class="btn sm primary" disabled={status.state === 'syncing'} onClick={() => syncNow('manual')}>Sync now</button>
          <button
            class="btn sm danger"
            onClick={() => {
              if (confirm('Stop syncing on this device? Your data stays on this device and in the repository.')) syncSettings.disconnect();
            }}
          >
            Disconnect this device
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="card">
      <h2>🔄 Sync across devices</h2>
      <p class="small">
        Keep uploads, ILOs, questions and progress the same on your Mac, phone and anywhere else. Everything is stored in a
        <b> private GitHub repository</b> that only you can see, with full history. Your API key never leaves each device.
      </p>
      <ol class="small steps">
        <li>
          Use your private repository (e.g. <code>abhat07/ilo-study-data</code>). If you need one, create it at{' '}
          <a href="https://github.com/new?name=ilo-study-data&visibility=private" target="_blank" rel="noreferrer">github.com/new</a> and tick <b>Private</b>.
        </li>
        <li>
          <a href={TOKEN_URL} target="_blank" rel="noreferrer">Create a fine-grained token</a>: <b>Repository access → Only select repositories →</b> that
          repo; <b>Permissions → Contents → Read and write</b>. Copy the token.
        </li>
        <li>Paste both below. Do this once on each device.</li>
      </ol>
      <label class="field">Repository</label>
      <input type="text" placeholder="username/ilo-study-data" value={repo} onInput={(e) => setRepo(e.currentTarget.value)} autocomplete="off" autocapitalize="off" spellcheck={false} />
      <label class="field">Token</label>
      <input type="password" placeholder="github_pat_…" value={token} onInput={(e) => setToken(e.currentTarget.value)} autocomplete="off" />
      <p class="muted small">Stored only in this browser. Never put in backups or the synced copy.</p>
      {err && <div class="err small" style={{ marginBottom: '8px' }}>{err}</div>}
      <button class="btn primary" disabled={busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect & sync'}</button>
    </div>
  );
}
