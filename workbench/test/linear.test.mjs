import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearGraphql, assertReadOnly } from '../linear/client.mjs';
import { READ_QUERIES } from '../linear/queries.mjs';
import { snapshotRows } from '../linear/rows.mjs';
import { syncLinear } from '../linear/sync.mjs';

const KEY = 'lin_api_testkeyonly';

test('read queries stay read-only and cover issues, states and teams', () => {
  assert.equal(READ_QUERIES.length, 3);
  const joined = READ_QUERIES.join('\n');
  assert.match(joined, /issues\(first:/);
  assert.match(joined, /workflowStates\(first:/);
  assert.match(joined, /teams\(first:/);
  assert.doesNotMatch(joined, /\bmutation\b/i);
  assert.throws(() => assertReadOnly('mutation IssueUpdate { issueUpdate { success } }'), /linear_write_disabled/);
});

test('graphql client sends the env key and never echoes it', async () => {
  let seen = null;
  const data = await linearGraphql('query { viewer { id } }', {}, {
    env: { LINEAR_API_KEY: KEY },
    endpoint: 'https://api.linear.app/graphql',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ data: { viewer: { id: 'u1' } } }), { status: 200 });
    },
  });
  assert.equal(data.viewer.id, 'u1');
  assert.equal(seen.url, 'https://api.linear.app/graphql');
  assert.equal(seen.init.headers.authorization, KEY);
  assert.equal(seen.init.body.includes(KEY), false);
  await assert.rejects(
    () => linearGraphql('query { viewer { id } }', {}, { env: {} }),
    /linear_key_missing/,
  );
});

test('sync writes issues, teams and states into the cache and the UI reader does not call Linear', async () => {
  const calls = [];
  const pages = {
    issues: { issues: { pageInfo: { hasNextPage: false }, nodes: [
      { id: 'iss_1', identifier: 'XC-1', title: '镜像', description: '只读', url: 'https://linear.app/xc/issue/XC-1', priority: 2, createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T01:00:00.000Z', state: { id: 'st_1', name: 'Todo', type: 'unstarted', color: '#bec2c8' }, team: { id: 'tm_1', key: 'XC', name: 'X-connect' }, assignee: { id: 'u1', name: 'Martin' } },
    ] } },
    teams: { teams: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'tm_1', key: 'XC', name: 'X-connect' }] } },
    workflowStates: { workflowStates: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'st_1', name: 'Todo', type: 'unstarted', color: '#bec2c8', team: { id: 'tm_1', key: 'XC', name: 'X-connect' } }] } },
  };
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.query);
    const key = body.query.includes('workflowStates') ? 'workflowStates' : (body.query.includes('teams(') ? 'teams' : 'issues');
    return new Response(JSON.stringify({ data: pages[key] }), { status: 200 });
  };
  const saved = [];
  const store = {
    async replaceCache(rows) { saved.splice(0, saved.length, ...rows); },
    async list(type) { return saved.filter((row) => row.record_type === type); },
  };
  const result = await syncLinear(store, {
    env: { LINEAR_API_KEY: KEY },
    fetchImpl,
    now: () => new Date('2026-10-28T02:00:00.000Z'),
  });
  assert.deepEqual(result, { syncedAt: '2026-10-28T02:00:00.000Z', issues: 1, teams: 1, workflowStates: 1 });
  assert.equal(saved.length, 3);
  assert.equal(saved.find((row) => row.record_type === 'issue').identifier, 'XC-1');
  assert.equal(JSON.stringify(saved).includes(KEY), false);
  assert.equal(calls.length, 3);

  const issues = saved.filter((row) => row.record_type === 'issue');
  const teams = saved.filter((row) => row.record_type === 'team');
  const workflowStates = saved.filter((row) => row.record_type === 'workflow_state');
  const view = { source: 'linear_issues', issues, teams, workflowStates };
  assert.equal(view.source, 'linear_issues');
  assert.equal(view.issues[0].title, '镜像');
  assert.equal(view.teams[0].team_key, 'XC');
  assert.equal(view.workflowStates[0].state_name, 'Todo');
  assert.equal(snapshotRows({ issues: [], teams: [], states: [], syncedAt: result.syncedAt }).length, 0);
});
