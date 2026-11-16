/** Model context contains host observations, never credentials or executable configuration. */
export type WorkspaceReference = {
  ref?: string;
  kind: string;
  entry_id?: string;
  title?: string;
  content_id?: string;
  segment_uid?: string;
  tag_id?: string;
  entry_ids?: string[];
  revision?: string;
  context_ref?: string;
};

export type WorkspaceContext = {
  version: 1;
  scope: { entries: Array<{ id: string; title: string }>; tags: Array<{ id: string; name: string }> };
  active_entry: { id: string; title: string; revision?: string } | null;
  active_note: { entry_id: string; id: string; title: string; revision?: string } | null;
  browser: { title: string; url: string; identity?: string } | null;
  references: WorkspaceReference[];
  pinned_segments: Array<{ entry_id: string; segment_uid: string; revision: string; context_ref: string }>;
};

export type RunContextPolicy = {
  mode: 'act' | 'plan';
  write_policy: string;
  source_policy: string;
  required_tools: string[];
};

export type ContextBaseline = {
  version: 1;
  workspace?: WorkspaceContext;
  policy?: RunContextPolicy;
};

export type ContextMemory = {
  summary: string;
  decisions: string[];
  entities: string[];
  last_user_goal: string | null;
  open_items: string[];
  user_preferences: string[];
  context_baseline?: ContextBaseline;
  observed_markers?: string[];
};
