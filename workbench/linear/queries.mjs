// Read-only Linear documents. Mutations are rejected by the client.

export const ISSUES_QUERY = `query LinearIssues($after: String) {
  issues(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      identifier
      title
      description
      url
      priority
      createdAt
      updatedAt
      state { id name type color }
      team { id key name }
      assignee { id name }
    }
  }
}`;

export const WORKFLOW_STATES_QUERY = `query LinearWorkflowStates($after: String) {
  workflowStates(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      type
      color
      team { id key name }
    }
  }
}`;

export const TEAMS_QUERY = `query LinearTeams($after: String) {
  teams(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id key name }
  }
}`;

export const READ_QUERIES = [ISSUES_QUERY, WORKFLOW_STATES_QUERY, TEAMS_QUERY];
