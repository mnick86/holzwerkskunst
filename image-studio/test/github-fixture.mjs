// In-memory GitHub REST implementation shared by tests and local browser QA.
// Never contacts GitHub or uses a real token.
export function createGitHubFixture() {
  const encode = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const blobs = new Map([
    [
      'b0',
      {
        content: encode(
          "id: brotzeitbrettchen\nname: Brotzeitbrettchen\ndescription: Ein graviertes Holzbrett\ndate: '2024-01-01'\ntags: [Geschenk, Geburtstag]\n",
        ),
        encoding: 'base64',
      },
    ],
    ['b1', {content: '/9j/', encoding: 'base64'}],
  ]);
  const trees = new Map([
    [
      't0',
      new Map([
        ['products/brotzeitbrettchen/spec.yaml', 'b0'],
        ['products/brotzeitbrettchen/10.jpg', 'b1'],
      ]),
    ],
  ]);
  const commits = new Map([['c0', {tree: 't0', parents: []}]]);
  const refs = new Map([['main', 'c0']]);
  const prs = new Map();
  const calls = [];
  let next = 1;
  const state = {
    validation: 'success',
    deployment: 'queued',
    fail: null,
    refs,
    trees,
    commits,
    blobs,
    prs,
    calls,
  };
  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
  const prData = (p) => ({
    number: p.number,
    title: p.title,
    state: p.closed || p.merged ? 'closed' : 'open',
    merged: Boolean(p.merged),
    draft: false,
    merge_commit_sha: p.mergeSha,
    head: {ref: p.head, sha: refs.get(p.head), repo: {full_name: 'mnick86/holzwerkskunst'}},
    base: {ref: 'main'},
  });
  const files = (p) => {
    const base = trees.get(commits.get(p.baseSha).tree);
    const current = trees.get(commits.get(refs.get(p.head)).tree);
    return [...current]
      .filter(([name, sha]) => base.get(name) !== sha)
      .map(([filename]) => ({filename, status: base.has(filename) ? 'modified' : 'added'}));
  };
  state.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.origin !== 'https://api.github.com')
      throw new Error('Unexpected test network destination');
    const method = options.method || 'GET';
    const route = decodeURIComponent(u.pathname).replace('/repos/mnick86/holzwerkskunst', '');
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({
      method,
      route,
      body,
      authorization: new Headers(options.headers).get('authorization'),
      url: u.href,
    });
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (state.fail === `${method} ${route}`)
      return json({message: 'PRIVATE simulated server detail'}, 503);
    if (!route)
      return json({default_branch: 'main', permissions: {push: true}, allow_squash_merge: true});
    if (method === 'GET' && route === '/branches') {
      const start = (Number(u.searchParams.get('page') || 1) - 1) * 100;
      return json(
        [...refs].slice(start, start + 100).map(([name, sha]) => ({name, commit: {sha}})),
      );
    }
    if (method === 'GET' && route.startsWith('/compare/')) {
      const sha = route.slice('/compare/main...'.length);
      const base = trees.get(commits.get(refs.get('main')).tree);
      const current = trees.get(commits.get(sha).tree);
      const changes = [...current]
        .filter(([name, value]) => base.get(name) !== value)
        .map(([filename]) => ({filename, status: base.has(filename) ? 'modified' : 'added'}));
      return json({files: changes, ahead_by: sha === refs.get('main') ? 0 : 1});
    }
    if (route.startsWith('/git/ref/heads/')) {
      const sha = refs.get(route.slice('/git/ref/heads/'.length));
      return sha ? json({object: {sha}}) : json({}, 404);
    }
    if (method === 'GET' && route.startsWith('/git/commits/')) {
      const commit = commits.get(route.split('/').at(-1));
      return commit ? json({tree: {sha: commit.tree}}) : json({}, 404);
    }
    if (method === 'GET' && route.startsWith('/git/trees/')) {
      const tree = trees.get(route.split('/').at(-1));
      return tree
        ? json({
            truncated: false,
            tree: [...tree].map(([path, sha]) => ({path, sha, type: 'blob', mode: '100644'})),
          })
        : json({}, 404);
    }
    if (method === 'GET' && route.startsWith('/git/blobs/'))
      return json(blobs.get(route.split('/').at(-1)));
    if (method === 'POST' && route === '/git/refs') {
      refs.set(body.ref.replace('refs/heads/', ''), body.sha);
      return json({object: {sha: body.sha}}, 201);
    }
    if (method === 'POST' && route === '/git/blobs') {
      const sha = `b${++next}`;
      blobs.set(sha, {
        encoding: 'base64',
        content: body.encoding === 'base64' ? body.content : encode(body.content),
      });
      return json({sha}, 201);
    }
    if (method === 'POST' && route === '/git/trees') {
      const tree = new Map(trees.get(body.base_tree));
      for (const entry of body.tree) tree.set(entry.path, entry.sha);
      const sha = `t${++next}`;
      trees.set(sha, tree);
      return json({sha}, 201);
    }
    if (method === 'POST' && route === '/git/commits') {
      const sha = `c${++next}`;
      commits.set(sha, body);
      return json({sha}, 201);
    }
    if (method === 'PATCH' && route.startsWith('/git/refs/heads/')) {
      const branch = route.slice('/git/refs/heads/'.length);
      if (body.force || commits.get(body.sha).parents[0] !== refs.get(branch)) return json({}, 409);
      refs.set(branch, body.sha);
      return json({object: {sha: body.sha}});
    }
    if (route === '/pulls' && method === 'GET') {
      const head = u.searchParams.get('head')?.split(':')[1];
      return json([...prs.values()].filter((p) => !head || p.head === head).map(prData));
    }
    if (route === '/pulls' && method === 'POST') {
      const p = {
        number: prs.size + 1,
        title: body.title,
        head: body.head,
        baseSha: refs.get('main'),
      };
      prs.set(p.number, p);
      return json(prData(p), 201);
    }
    if (/^\/pulls\/\d+\/files$/.test(route)) {
      const p = prs.get(Number(route.split('/')[2]));
      const start = (Number(u.searchParams.get('page') || 1) - 1) * 100;
      return json(files(p).slice(start, start + 100));
    }
    if (/^\/pulls\/\d+\/merge$/.test(route) && method === 'PUT') {
      const p = prs.get(Number(route.split('/')[2]));
      if (body.sha !== refs.get(p.head)) return json({}, 409);
      p.merged = true;
      p.mergeSha = body.sha;
      refs.set('main', body.sha);
      return json({merged: true, sha: body.sha});
    }
    if (/^\/pulls\/\d+$/.test(route)) {
      const p = prs.get(Number(route.split('/')[2]));
      return p ? json(prData(p)) : json({}, 404);
    }
    if (route.startsWith('/actions/workflows/')) {
      const validation = route.includes('validate-products.yaml');
      const value = validation ? state.validation : state.deployment;
      if (value === 'unavailable') return json({}, 403);
      if (value === 'waiting') return json({workflow_runs: []});
      return json({
        workflow_runs: [
          {
            id: validation ? 100 : 200,
            head_sha: u.searchParams.get('head_sha'),
            status: ['success', 'failure', 'cancelled'].includes(value) ? 'completed' : value,
            conclusion: ['success', 'failure', 'cancelled'].includes(value) ? value : null,
          },
        ],
      });
    }
    throw new Error(`Unhandled mock route: ${method} ${route}`);
  };
  return state;
}
