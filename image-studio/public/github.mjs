import {Octokit} from 'octokit';
import {parse, stringify, Document, Scalar} from 'yaml';

export const REPOSITORY = {owner: 'mnick86', repo: 'holzwerkskunst'};
export const TOKEN_STORAGE = 'holzwerkskunst.image-studio.github-token';
export const SESSION_STORAGE = 'holzwerkskunst.image-studio.github-session';
const API_ORIGIN = 'https://api.github.com';
const repoUrl = `https://github.com/${REPOSITORY.owner}/${REPOSITORY.repo}`;
const isTargetBranch = (name) =>
  typeof name === 'string' && name.length > 0 && !['main', 'gh-pages'].includes(name);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

export class GitHubError extends Error {}

export function branchName(title) {
  const slug = text(title)
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return `image-studio/${slug || 'produktbilder'}`;
}

export function validateProduct(input) {
  const id = text(input.id);
  const name = text(input.name);
  const description = text(input.description);
  const date = text(input.date);
  const tags = [
    ...new Set((Array.isArray(input.tags) ? input.tags : text(input.tags).split(',')).map(text)),
  ];
  if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(id) || id.length > 80)
    throw new GitHubError(
      'Die Produkt-ID darf nur Kleinbuchstaben, Zahlen, Bindestriche und Unterstriche enthalten.',
    );
  if (!name || name.length > 120 || !description || description.length > 8000)
    throw new GitHubError(
      'Bitte Produktname (max. 120 Zeichen) und Beschreibung (max. 8000 Zeichen) ausfüllen.',
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new GitHubError('Bitte ein gültiges Datum eingeben.');
  if (
    !tags.length ||
    tags.length > 20 ||
    tags.some((tag) => !/^[\p{L}\p{N}][\p{L}\p{N} &_\-]{0,59}$/u.test(tag))
  )
    throw new GitHubError(
      'Bitte mindestens eine Kategorie eingeben. Mehrere Kategorien mit Komma trennen.',
    );
  return {id, name, description, date, tags};
}

export function validateProductTags(tags, existingTags) {
  const allowed = new Set(existingTags);
  const values = (Array.isArray(tags) ? tags : text(tags).split(',')).map(text);
  const unknown = [...new Set(values.filter((tag) => tag && !allowed.has(tag)))];
  if (unknown.length)
    throw new GitHubError(
      `Unbekannte Tags: ${unknown
        .map((tag) => `„${tag}“`)
        .join(', ')}. Bitte nur vorhandene Tags in der angegebenen Schreibweise verwenden.`,
    );
}

export function productYaml(product) {
  const document = new Document(validateProduct(product));
  document.get('date', true).type = Scalar.QUOTE_SINGLE;
  return String(document);
}

export function imageFilename(value) {
  let name = text(value);
  if (!/\.jpe?g$/i.test(name)) name += '.jpg';
  name = name.replace(/\.jpe?g$/i, '.jpg');
  const stem = name.slice(0, -4);
  if (
    !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,99}$/u.test(stem) ||
    stem.includes('..') ||
    stem.toLowerCase() === 'spec'
  )
    throw new GitHubError(
      'Bitte einen Dateinamen ohne Ordnerpfad eingeben, z. B. 100.jpg. „spec“ ist reserviert.',
    );
  return name;
}

export function nextFilename(paths, folder) {
  const numbers = paths
    .filter((p) => p.startsWith(`products/${folder}/`))
    .map((p) => Number.parseInt(p.split('/').at(-1), 10))
    .filter(Number.isFinite);
  return `${numbers.length ? Math.max(...numbers) + 10 : 10}.jpg`;
}

// Match mustache.ts sortImages, including its generated small-image filename tie-breaker.
export function compareCatalogImages(a, b) {
  const name = (path) => path.split('/').at(-1);
  const order = (path) => {
    const value = Number.parseInt(name(path), 10);
    return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
  };
  const smallName = (path) => name(path).replace(/(\.[^.]+)$/, '__400_300.webp');
  return order(a) - order(b) || smallName(a).localeCompare(smallName(b), 'de');
}

function decodeBlob(content) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(content.replace(/\s/g, '')), (c) => c.charCodeAt(0)),
  );
}

function encodeBlob(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}

async function defaultDimensions(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return {width: bitmap.width, height: bitmap.height};
  } finally {
    bitmap.close();
  }
}

function safeError(error) {
  if (error instanceof GitHubError) return error;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError')
    return new GitHubError(
      'GitHub-Anfrage abgebrochen. Bereits übertragene Änderungen bleiben im Branch; bitte erneut mit GitHub verbinden.',
    );
  const messages = {
    401: 'GitHub hat den Token abgelehnt. Bitte den gespeicherten Token ersetzen.',
    403: 'GitHub-Zugriff verweigert. Token-Rechte, Repository-Regeln oder API-Limit prüfen.',
    404: 'GitHub-Ressource nicht gefunden. Repository, Branch und Token-Zugriff prüfen.',
    405: 'Der PR kann noch nicht gemergt werden. Prüfungen und Branch-Regeln auf GitHub prüfen.',
    409: 'Der Branch wurde geändert oder hat einen Konflikt. Bitte erneut mit GitHub verbinden und die Änderungen prüfen.',
    422: 'GitHub konnte die Änderung nicht übernehmen. Bitte erneut mit GitHub verbinden und Branch, Dateinamen und PR prüfen.',
  };
  return new GitHubError(
    messages[error?.status] ||
      'GitHub-Anfrage fehlgeschlagen. Bitte erneut mit GitHub verbinden, bevor du die Aktion erneut startest.',
  );
}

export function createGitHubClient({
  getToken,
  fetchImpl = globalThis.fetch,
  onChange = () => {},
  getDimensions = defaultDimensions,
  OctokitImpl = Octokit,
} = {}) {
  let controller;
  let repository;
  const branchSessions = new Map();
  const specCache = new Map();
  let state = {
    connected: false,
    busy: false,
    base: 'main',
    session: null,
    branches: [],
    products: [],
    paths: [],
    imageFiles: [],
    catalogBranch: null,
    catalogHead: null,
    catalogProductsLoaded: false,
    files: [],
    filesTruncated: false,
    aheadBy: 0,
    deployment: null,
  };
  const snapshot = () => structuredClone(state);
  const changed = () => onChange(snapshot());
  function client() {
    const token = text(getToken?.());
    if (!/^[\x21-\x7e]{1,4096}$/.test(token))
      throw new GitHubError('Bitte zuerst einen GitHub-Token speichern.');
    return new OctokitImpl({
      auth: token,
      baseUrl: API_ORIGIN,
      retry: {enabled: false},
      throttle: {enabled: false},
      log: {debug() {}, info() {}, warn() {}, error() {}},
      request: {
        fetch: (url, options) => {
          if (new URL(url).origin !== API_ORIGIN)
            throw new GitHubError('Unerwartetes GitHub-API-Ziel blockiert.');
          return fetchImpl(url, {...options, cache: 'no-store', redirect: 'error'});
        },
      },
    });
  }
  const request = (api, route, params = {}) =>
    api
      .request(route, {...REPOSITORY, ...params, request: {signal: controller.signal}})
      .then((r) => r.data);
  async function run(action) {
    if (state.busy) throw new GitHubError('Bitte die laufende GitHub-Aktion abwarten.');
    state.busy = true;
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    changed();
    try {
      return await action(client());
    } catch (error) {
      if (controller.signal.aborted) state.connected = false;
      throw safeError(error);
    } finally {
      clearTimeout(timer);
      state.busy = false;
      changed();
    }
  }
  async function head(api, branch) {
    const ref = await request(api, 'GET /repos/{owner}/{repo}/git/ref/{ref}', {
      ref: `heads/${branch}`,
    });
    const commit = await request(api, 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
      commit_sha: ref.object.sha,
    });
    return {sha: ref.object.sha, tree: commit.tree.sha};
  }
  async function loadBranches(api) {
    const names = [];
    for (let page = 1; ; page++) {
      const branches = await request(api, 'GET /repos/{owner}/{repo}/branches', {
        per_page: 100,
        page,
      });
      names.push(...branches.map((branch) => branch.name).filter(isTargetBranch));
      if (branches.length < 100) break;
    }
    state.branches = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'de', {numeric: true}));
  }
  function rememberSession() {
    if (state.session) branchSessions.set(state.session.branch, structuredClone(state.session));
  }
  async function compareBranch(api) {
    const comparison = await request(api, 'GET /repos/{owner}/{repo}/compare/{basehead}', {
      basehead: `${state.base}...${state.session.head}`,
      per_page: 1,
    });
    state.files = (comparison.files || []).map(({filename, status}) => ({filename, status}));
    state.filesTruncated = state.files.length >= 300;
    state.aheadBy = comparison.ahead_by || 0;
  }
  async function catalog(api, branch, revision = null, loadProducts = false) {
    const current = revision || (await head(api, branch));
    const tree = await request(api, 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      tree_sha: current.tree,
      recursive: '1',
    });
    if (tree.truncated) throw new GitHubError('Der Repository-Baum ist zu groß für diese Ansicht.');
    state.paths = tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
    state.imageFiles = tree.tree
      .filter(
        (entry) =>
          entry.type === 'blob' &&
          entry.mode !== '120000' &&
          /^products\/[^/]+\/[^/]+\.(jpe?g|png)$/i.test(entry.path),
      )
      .map(({path, sha, size}) => ({path, sha, size}));
    const specs = tree.tree.filter(
      (entry) =>
        entry.type === 'blob' &&
        entry.mode !== '120000' &&
        /^products\/[^/]+\/spec\.yaml$/.test(entry.path),
    );
    const products = [];
    // Read only the chosen folder's YAML; all specs are needed for creating a new product.
    const availableSpecs = specs.filter(
      (entry) =>
        loadProducts === true ||
        (typeof loadProducts === 'string' && entry.path === `products/${loadProducts}/spec.yaml`) ||
        specCache.has(entry.sha),
    );
    for (let i = 0; i < availableSpecs.length; i += 4) {
      products.push(
        ...(await Promise.all(
          availableSpecs.slice(i, i + 4).map(async (entry) => {
            let spec = specCache.get(entry.sha);
            if (!spec) {
              const blob = await request(api, 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
                file_sha: entry.sha,
              });
              spec = parse(decodeBlob(blob.content));
              if (
                !spec ||
                typeof spec.id !== 'string' ||
                typeof spec.name !== 'string' ||
                !Array.isArray(spec.tags)
              )
                throw new GitHubError(`Ungültige Produktdaten: ${entry.path}`);
              // Git blob SHAs identify immutable content, also across branches and image uploads.
              specCache.set(entry.sha, spec);
            }
            return {...spec, folder: entry.path.split('/')[1], pending: false};
          }),
        )),
      );
    }
    state.products = products.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    for (const product of state.session?.drafts || []) {
      if (!products.some((p) => p.folder === product.id))
        state.products.push({...product, folder: product.id, pending: true});
    }
    state.catalogBranch = branch;
    state.catalogHead = current.sha;
    state.catalogProductsLoaded = specs.every((entry) => specCache.has(entry.sha));
    return current;
  }
  async function createBranch(api, title, sha) {
    const base = branchName(title);
    for (let index = 1; index <= 100; index++) {
      const branch = index === 1 ? base : `${base}-${index}`;
      const ref = `heads/${branch}`;
      async function exists() {
        try {
          await request(api, 'GET /repos/{owner}/{repo}/git/ref/{ref}', {ref});
          return true;
        } catch (error) {
          if (error.status === 404) return false;
          throw error;
        }
      }
      if (await exists()) continue;
      try {
        await request(api, 'POST /repos/{owner}/{repo}/git/refs', {
          ref: `refs/${ref}`,
          sha,
        });
        return branch;
      } catch (error) {
        // Another session may have taken the same name after the existence check.
        if (error.status === 422 && (await exists())) continue;
        throw error;
      }
    }
    throw new GitHubError(
      'Dieser Branchname ist bereits häufig vergeben. Bitte einen anderen PR-Titel wählen.',
    );
  }
  function active() {
    if (!state.connected || !state.session || state.session.closed || state.session.merged)
      throw new GitHubError('Bitte einen Branch auswählen oder erstellen.');
    if (
      !isTargetBranch(state.session.branch) ||
      !state.branches.includes(state.session.branch) ||
      state.session.base !== 'main'
    )
      throw new GitHubError('Ungültige PR-Sitzung.');
    return state.session;
  }
  async function ensurePr(api, create = false, confirmedHead = null) {
    const session = state.session;
    const pulls = await request(api, 'GET /repos/{owner}/{repo}/pulls', {
      state: session.pullNumber ? 'all' : 'open',
      head: `${REPOSITORY.owner}:${session.branch}`,
      base: session.base,
      per_page: 100,
    });
    let pr = pulls.find(
      (p) =>
        (session.pullNumber ? p.number === session.pullNumber : p.state === 'open') &&
        p.head.ref === session.branch &&
        p.head.repo?.full_name?.toLowerCase() ===
          `${REPOSITORY.owner}/${REPOSITORY.repo}`.toLowerCase() &&
        p.base.ref === session.base,
    );
    if (!pr && !create) {
      session.pullNumber = null;
      await compareBranch(api);
      return null;
    }
    if (!pr && session.head === session.baseSha) return null;
    if (!pr)
      pr = await request(api, 'POST /repos/{owner}/{repo}/pulls', {
        title: session.title,
        head: session.branch,
        base: session.base,
        body: 'Produktbilder aus dem Holzwerkskunst Bildstudio. Veröffentlichung erfolgt erst beim Klick auf „Branch mergen“.',
      });
    session.pullNumber = pr.number;
    const current = await request(api, 'GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      pull_number: pr.number,
    });
    if (current.head.ref !== session.branch || current.base.ref !== session.base)
      throw new GitHubError('Der PR gehört nicht zur aktiven Sitzung.');
    session.merged = Boolean(current.merged);
    session.closed = current.state === 'closed' && !current.merged;
    // PR metadata can lag behind a just-pushed commit. Read the actual branch head.
    session.head =
      session.merged || session.closed
        ? current.head.sha
        : confirmedHead || (await head(api, session.branch)).sha;
    state.files = [];
    state.filesTruncated = false;
    for (let page = 1; ; page++) {
      const files = await request(api, 'GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
        pull_number: pr.number,
        per_page: 100,
        page,
      });
      state.files.push(...files.map(({filename, status}) => ({filename, status})));
      if (files.length < 100) break;
      if (page >= 30) {
        state.filesTruncated = true;
        break;
      }
    }
    if (!session.merged && !session.closed) {
      const prFiles = state.files;
      const prFilesTruncated = state.filesTruncated;
      await compareBranch(api);
      // Keep the longer PR file list only when it describes the same commit.
      if (current.head.sha === session.head && prFiles.length >= state.files.length) {
        state.files = prFiles;
        state.filesTruncated = prFilesTruncated;
      }
    } else {
      state.aheadBy = 0;
    }
    return current;
  }
  async function workflow(api, filename, sha, event) {
    try {
      const result = await request(
        api,
        'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
        {workflow_id: filename, head_sha: sha, event, per_page: 100},
      );
      const latest = result.workflow_runs
        .filter((r) => r.head_sha === sha)
        .sort((a, b) => b.id - a.id)[0];
      if (!latest) return {status: 'waiting', conclusion: null};
      return {
        status: latest.status,
        conclusion: latest.conclusion,
        url: `${repoUrl}/actions/runs/${latest.id}`,
      };
    } catch (error) {
      if ([403, 404].includes(error.status))
        return {
          status: 'unavailable',
          conclusion: null,
          reason: error.status === 404 ? 'not_found' : 'forbidden',
        };
      throw error;
    }
  }
  async function refresh(api, createPr = false, revision = null, loadProducts = false) {
    const session = state.session;
    if (!session) {
      await catalog(api, state.base, null, loadProducts);
      return;
    }
    const existing = session.pullNumber
      ? await request(api, 'GET /repos/{owner}/{repo}/pulls/{pull_number}', {
          pull_number: session.pullNumber,
        })
      : null;
    if (existing?.merged || existing?.state === 'closed') {
      session.merged = Boolean(existing.merged);
      session.closed = !existing.merged;
      session.mergeSha = existing.merge_commit_sha;
      await ensurePr(api);
      await catalog(api, state.base, null, loadProducts);
    } else {
      const current = await catalog(api, session.branch, revision, loadProducts);
      session.head = current.sha;
      await ensurePr(api, createPr, revision?.sha);
    }
    state.deployment =
      session.merged && session.mergeSha
        ? await workflow(api, 'deploy.yaml', session.mergeSha, 'push')
        : null;
  }
  return {
    getState: snapshot,
    async readImage(path, signal, expectedSha) {
      try {
        if (!state.connected) throw new GitHubError('Bitte zuerst mit GitHub verbinden.');
        const entry = state.imageFiles.find((image) => image.path === path);
        if (!entry || (expectedSha && entry.sha !== expectedSha))
          throw new GitHubError('Dieses Produktbild ist nicht mehr verfügbar.');
        if (entry.size > 20 * 1024 * 1024)
          throw new GitHubError('Dieses Bild ist zu groß für eine Vorschau.');
        const timeout = AbortSignal.timeout(30000);
        const {data} = await client().request('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
          ...REPOSITORY,
          file_sha: entry.sha,
          request: {signal: signal ? AbortSignal.any([signal, timeout]) : timeout},
        });
        if (
          data.encoding !== 'base64' ||
          typeof data.content !== 'string' ||
          data.content.length > 29_000_000
        )
          throw new GitHubError('Keine verwendbare Bildvorschau erhalten.');
        const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, '')), (c) =>
          c.charCodeAt(0),
        );
        const type = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
        return new Blob([bytes], {type});
      } catch (error) {
        throw safeError(error);
      }
    },
    disconnect() {
      controller?.abort();
      specCache.clear();
      state.catalogProductsLoaded = false;
      state.connected = false;
      changed();
    },
    async connect(saved) {
      return run(async (api) => {
        repository = await request(api, 'GET /repos/{owner}/{repo}');
        if (repository.permissions?.push === false)
          throw new GitHubError(
            'Dieser GitHub-Zugang hat keinen Schreibzugriff auf das Repository.',
          );
        if (repository.default_branch !== 'main')
          throw new GitHubError(
            'Der Deployment-Workflow erwartet main als Standardbranch. Bitte die Repository-Konfiguration prüfen.',
          );
        await loadBranches(api);
        state.connected = true;
        if (saved) {
          if (
            saved.owner !== REPOSITORY.owner ||
            saved.repo !== REPOSITORY.repo ||
            !isTargetBranch(saved.branch) ||
            saved.base !== 'main'
          )
            throw new GitHubError('Die gespeicherte PR-Sitzung ist ungültig.');
          state.session = {
            ...saved,
            title: text(saved.title).slice(0, 150),
            drafts: (saved.drafts || []).map(validateProduct),
          };
          if (!state.branches.includes(saved.branch) && !saved.merged && !saved.closed) {
            rememberSession();
            state.session = null;
            state.files = [];
            state.filesTruncated = false;
            state.aheadBy = 0;
          }
        }
        await refresh(api);
      });
    },
    async selectBranch(branch) {
      return run(async (api) => {
        if (!state.connected) throw new GitHubError('Bitte zuerst mit GitHub verbinden.');
        const previous = snapshot();
        rememberSession();
        try {
          await loadBranches(api);
          if (!isTargetBranch(branch) || !state.branches.includes(branch))
            throw new GitHubError('Bitte einen vorhandenen Branch außer main und gh-pages wählen.');
          const main = await head(api, state.base);
          const cached = branchSessions.get(branch);
          state.session = {
            owner: REPOSITORY.owner,
            repo: REPOSITORY.repo,
            branch,
            base: state.base,
            baseSha: main.sha,
            head: null,
            title: (cached?.title || branch).slice(0, 150),
            pullNumber: null,
            drafts: cached?.drafts || [],
            merged: false,
            closed: false,
          };
          state.files = [];
          state.filesTruncated = false;
          state.aheadBy = 0;
          state.deployment = null;
          await refresh(api);
        } catch (error) {
          state = {...previous, branches: state.branches};
          throw error;
        }
      });
    },
    async start(title) {
      return run(async (api) => {
        if (!state.connected) throw new GitHubError('Bitte zuerst mit GitHub verbinden.');
        const name = text(title);
        if (!name || name.length > 150)
          throw new GitHubError('Bitte einen PR-Titel mit maximal 150 Zeichen eingeben.');
        const previous = snapshot();
        rememberSession();
        try {
          state.session = null;
          const current = await catalog(api, state.base);
          const branch = await createBranch(api, name, current.sha);
          state.branches = [...new Set([...state.branches, branch])].sort((a, b) =>
            a.localeCompare(b, 'de', {numeric: true}),
          );
          state.session = {
            owner: REPOSITORY.owner,
            repo: REPOSITORY.repo,
            branch,
            base: state.base,
            baseSha: current.sha,
            head: current.sha,
            title: name,
            pullNumber: null,
            drafts: [],
            merged: false,
            closed: false,
          };
          state.files = [];
          state.filesTruncated = false;
          state.aheadBy = 0;
          state.deployment = null;
        } catch (error) {
          state = previous;
          throw error;
        }
      });
    },
    leave() {
      if (state.busy) throw new GitHubError('Bitte die laufende Aktion abwarten.');
      rememberSession();
      state.session = null;
      state.files = [];
      state.filesTruncated = false;
      state.aheadBy = 0;
      state.deployment = null;
      state.products = state.products.filter((p) => !p.pending);
      changed();
    },
    addProduct(input) {
      active();
      if (state.busy) throw new GitHubError('Bitte die laufende Aktion abwarten.');
      if (!state.catalogProductsLoaded)
        throw new GitHubError('Bitte zuerst die Produktdaten im Hinzufügen-Dialog laden.');
      const product = validateProduct(input);
      validateProductTags(
        product.tags,
        state.products.filter((p) => !p.pending).flatMap((p) => p.tags),
      );
      if (
        state.products.some(
          (p) => p.id.toLowerCase() === product.id || p.folder.toLowerCase() === product.id,
        )
      )
        throw new GitHubError('Diese Produkt-ID oder dieser Ordner existiert bereits.');
      state.session.drafts.push(product);
      state.products.push({...product, folder: product.id, pending: true});
      changed();
      return product.id;
    },
    discardProduct(id) {
      active();
      if (state.busy) throw new GitHubError('Bitte die laufende Aktion abwarten.');
      state.session.drafts = state.session.drafts.filter((p) => p.id !== id);
      state.products = state.products.filter((p) => !p.pending || p.id !== id);
      changed();
    },
    refresh: ({loadProducts = state.catalogProductsLoaded} = {}) =>
      run(async (api) => {
        if (!state.connected) throw new GitHubError('Bitte zuerst mit GitHub verbinden.');
        await loadBranches(api);
        await refresh(api, false, null, loadProducts);
      }),
    async addImage({folder, filename, blob, description = ''}) {
      return run(async (api) => {
        const session = active();
        const current = await head(api, session.branch);
        if (current.sha !== session.head)
          throw new GitHubError(
            'Der PR wurde geändert. Bitte erneut mit GitHub verbinden und die Dateiliste prüfen.',
          );
        const loadProducts = session.drafts.some((p) => p.id === folder) ? true : folder;
        await catalog(api, session.branch, null, loadProducts);
        const product = state.products.find((p) => p.folder === folder);
        if (!product) throw new GitHubError('Bitte einen vorhandenen Produktordner auswählen.');
        if (product.pending)
          validateProductTags(
            product.tags,
            state.products.filter((p) => !p.pending).flatMap((p) => p.tags),
          );
        const name = imageFilename(filename);
        const stem = name.slice(0, -4);
        const prefix = `products/${folder}/`;
        if (
          state.paths.some(
            (p) =>
              p.toLowerCase().startsWith(prefix.toLowerCase()) &&
              p.split('/').length === 3 &&
              p
                .split('/')
                .at(-1)
                .replace(/\.(jpg|jpeg|png|yaml)$/i, '')
                .toLowerCase() === stem.toLowerCase(),
          )
        )
          throw new GitHubError(
            'Dieser Bildname oder seine YAML-Datei existiert bereits. Bitte einen neuen Dateinamen wählen.',
          );
        const alt = text(description);
        if (alt.length > 500)
          throw new GitHubError('Die Bildbeschreibung darf maximal 500 Zeichen enthalten.');
        if (
          !(blob instanceof Blob) ||
          blob.type !== 'image/jpeg' ||
          !blob.size ||
          blob.size > 10 * 1024 * 1024
        )
          throw new GitHubError('Es wird eine echte JPEG-Datei bis 10 MB benötigt.');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
          throw new GitHubError('Die Datei ist kein JPEG.');
        const {width, height} = await getDimensions(blob);
        if (!width || !height || Math.abs(width / height - 4 / 3) >= 0.01)
          throw new GitHubError(
            'Produktbilder müssen im 4:3-Format vorliegen. Bitte ein passendes Bild hochladen oder ein Ergebnis mit 1024 × 768 Pixeln erzeugen.',
          );
        const files = [{path: prefix + name, content: encodeBlob(bytes), encoding: 'base64'}];
        if (product.pending)
          files.push({
            path: prefix + 'spec.yaml',
            content: productYaml(product),
            encoding: 'utf-8',
          });
        if (alt)
          files.push({
            path: prefix + stem + '.yaml',
            content: stringify({description: alt}),
            encoding: 'utf-8',
          });
        const entries = [];
        for (const file of files) {
          const result = await request(api, 'POST /repos/{owner}/{repo}/git/blobs', {
            content: file.content,
            encoding: file.encoding,
          });
          entries.push({path: file.path, mode: '100644', type: 'blob', sha: result.sha});
        }
        const tree = await request(api, 'POST /repos/{owner}/{repo}/git/trees', {
          base_tree: current.tree,
          tree: entries,
        });
        const commit = await request(api, 'POST /repos/{owner}/{repo}/git/commits', {
          message: `Produktbild hinzufügen: ${folder}/${name}`,
          tree: tree.sha,
          parents: [current.sha],
        });
        await request(api, 'PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
          ref: `heads/${session.branch}`,
          sha: commit.sha,
          force: false,
        });
        session.head = commit.sha;
        if (product.pending) {
          const specEntry = entries.find((entry) => entry.path === prefix + 'spec.yaml');
          specCache.set(specEntry.sha, validateProduct(product));
        }
        session.drafts = session.drafts.filter((p) => p.id !== product.id);
        // Persist the confirmed commit even if subsequent PR creation/status loading fails.
        changed();
        // Load the confirmed commit tree, rather than a potentially delayed branch ref.
        await refresh(api, true, {sha: commit.sha, tree: tree.sha}, loadProducts);
        return prefix + name;
      });
    },
    async publish() {
      return run(async (api) => {
        const session = active();
        const reviewedHead = session.head;
        if (session.drafts.length)
          throw new GitHubError(
            'Es gibt vorbereitete Produkte ohne Bild. Bitte zuerst ein Bild hinzufügen oder diese Entwürfe verwerfen.',
          );
        const pr = await ensurePr(api, true);
        if (!pr || (!state.files.length && !state.aheadBy))
          throw new GitHubError('Dieser Branch enthält keine Änderungen zum Mergen.');
        if (session.head !== reviewedHead)
          throw new GitHubError(
            'Der PR wurde geändert. Bitte die aktualisierte Dateiliste vor dem Veröffentlichen prüfen.',
          );
        if (pr.draft)
          throw new GitHubError(
            'Der PR ist auf GitHub als Entwurf markiert. Bitte dort zur Prüfung freigeben.',
          );
        const mergeMethod = repository.allow_squash_merge
          ? 'squash'
          : repository.allow_merge_commit
            ? 'merge'
            : repository.allow_rebase_merge
              ? 'rebase'
              : null;
        if (!mergeMethod)
          throw new GitHubError('Im Repository ist keine unterstützte Merge-Methode freigegeben.');
        const result = await request(api, 'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
          pull_number: session.pullNumber,
          sha: session.head,
          merge_method: mergeMethod,
        });
        if (!result.merged)
          throw new GitHubError('GitHub hat den PR nicht gemergt. Bitte den PR-Status prüfen.');
        session.merged = true;
        session.mergeSha = result.sha;
        changed();
        let deletionWarning = '';
        try {
          if (!isTargetBranch(session.branch))
            throw new GitHubError('Dieser Branch darf nicht gelöscht werden.');
          const ref = `heads/${session.branch}`;
          let current;
          try {
            current = await request(api, 'GET /repos/{owner}/{repo}/git/ref/{ref}', {ref});
          } catch (error) {
            // GitHub may already have deleted the branch through repository settings.
            if (error.status !== 404) throw error;
          }
          if (current) {
            if (current.object.sha !== session.head)
              throw new GitHubError('Der Branch enthält inzwischen neue Commits.');
            try {
              await request(api, 'DELETE /repos/{owner}/{repo}/git/refs/{ref}', {ref});
            } catch (error) {
              // Automatic deletion may also happen between the read and delete requests.
              try {
                await request(api, 'GET /repos/{owner}/{repo}/git/ref/{ref}', {ref});
              } catch (checkError) {
                if (checkError.status !== 404) throw error;
                current = null;
              }
              if (current) throw error;
            }
          }
          session.branchDeleted = true;
          state.branches = state.branches.filter((branch) => branch !== session.branch);
          branchSessions.delete(session.branch);
        } catch {
          deletionWarning =
            'Der Merge war erfolgreich, aber der Branch konnte nicht gelöscht werden. Bitte auf GitHub prüfen und gegebenenfalls dort löschen.';
        }
        changed();
        try {
          state.deployment = await workflow(api, 'deploy.yaml', result.sha, 'push');
        } catch {
          // A status-read failure must not turn an already successful merge into an error.
          state.deployment = {status: 'unavailable', conclusion: null};
        }
        return {branchDeleted: Boolean(session.branchDeleted), deletionWarning};
      });
    },
  };
}

export const pullRequestUrl = (number) => `${repoUrl}/pull/${Number(number)}`;
export const actionsUrl = `${repoUrl}/actions`;
