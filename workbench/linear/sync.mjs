import { fetchConnection } from './client.mjs';
import { ISSUES_QUERY, TEAMS_QUERY, WORKFLOW_STATES_QUERY } from './queries.mjs';
import { snapshotRows } from './rows.mjs';

export async function pullLinear(options = {}) {
  const [issues, teams, states] = await Promise.all([
    fetchConnection(ISSUES_QUERY, 'issues', options),
    fetchConnection(TEAMS_QUERY, 'teams', options),
    fetchConnection(WORKFLOW_STATES_QUERY, 'workflowStates', options),
  ]);
  return { issues, teams, states };
}

export async function syncLinear(store, options = {}) {
  const syncedAt = (options.now || (() => new Date()))().toISOString();
  const pulled = await pullLinear(options);
  const rows = snapshotRows({ ...pulled, syncedAt });
  await store.replaceCache(rows);
  return {
    syncedAt,
    issues: pulled.issues.length,
    teams: pulled.teams.length,
    workflowStates: pulled.states.length,
  };
}
