export type WebSearchProviderKey = 'duckduckgo' | 'arxiv' | 'tavily';

export type WebSearchSettingsState = {
  enabled: boolean;
  providers: WebSearchProviderKey[];
  tavily: {
    has_api_key: boolean;
    token_source: 'credential_store' | 'environment' | null;
  };
};

export type WebSearchConnectionStatus = {
  ok: boolean;
  provider: string;
  result_count: number;
};