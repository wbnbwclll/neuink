import { invoke } from '@tauri-apps/api/core';

import type {
  WebSearchConnectionStatus,
  WebSearchProviderKey,
  WebSearchSettingsState
} from './webSearchTypes';

export function getWebSearchSettings() {
  return invoke<WebSearchSettingsState>('get_web_search_settings');
}

export function revealTavilyApiToken() {
  return invoke<string>('reveal_tavily_api_token');
}

export function saveWebSearchSettings(request: {
  enabled?: boolean;
  providers?: WebSearchProviderKey[];
  tavilyApiKey?: string;
  clearTavilyApiKey?: boolean;
}) {
  return invoke<WebSearchSettingsState>('save_web_search_settings', {
    request: {
      enabled: request.enabled ?? null,
      providers: request.providers ?? null,
      tavily_api_key: request.tavilyApiKey || null,
      clear_tavily_api_key: request.clearTavilyApiKey ?? false
    }
  });
}

export function testWebSearchProvider(provider: WebSearchProviderKey) {
  return invoke<WebSearchConnectionStatus>('test_web_search_provider', { provider });
}