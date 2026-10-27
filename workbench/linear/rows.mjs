function clean(value) {
  if (value == null) return null;
  const text = String(value);
  return text.length ? text : null;
}

export function issueToRow(node, syncedAt) {
  return {
    record_type: 'issue',
    id: node.id,
    identifier: clean(node.identifier),
    title: clean(node.title) || '',
    description: clean(node.description),
    url: clean(node.url),
    priority: Number.isInteger(node.priority) ? node.priority : null,
    team_id: clean(node.team?.id),
    team_key: clean(node.team?.key),
    team_name: clean(node.team?.name),
    state_id: clean(node.state?.id),
    state_name: clean(node.state?.name),
    state_type: clean(node.state?.type),
    state_color: clean(node.state?.color),
    assignee_name: clean(node.assignee?.name),
    created_at: clean(node.createdAt),
    updated_at: clean(node.updatedAt),
    synced_at: syncedAt,
    payload: node,
  };
}

export function teamToRow(node, syncedAt) {
  return {
    record_type: 'team',
    id: node.id,
    identifier: clean(node.key),
    title: clean(node.name) || '',
    description: null,
    url: null,
    priority: null,
    team_id: node.id,
    team_key: clean(node.key),
    team_name: clean(node.name),
    state_id: null,
    state_name: null,
    state_type: null,
    state_color: null,
    assignee_name: null,
    created_at: null,
    updated_at: null,
    synced_at: syncedAt,
    payload: node,
  };
}

export function stateToRow(node, syncedAt) {
  return {
    record_type: 'workflow_state',
    id: node.id,
    identifier: null,
    title: clean(node.name) || '',
    description: null,
    url: null,
    priority: null,
    team_id: clean(node.team?.id),
    team_key: clean(node.team?.key),
    team_name: clean(node.team?.name),
    state_id: node.id,
    state_name: clean(node.name),
    state_type: clean(node.type),
    state_color: clean(node.color),
    assignee_name: null,
    created_at: null,
    updated_at: null,
    synced_at: syncedAt,
    payload: node,
  };
}

export function snapshotRows({ issues = [], teams = [], states = [], syncedAt }) {
  return [
    ...issues.map((node) => issueToRow(node, syncedAt)),
    ...teams.map((node) => teamToRow(node, syncedAt)),
    ...states.map((node) => stateToRow(node, syncedAt)),
  ];
}
