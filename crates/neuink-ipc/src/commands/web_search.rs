use std::{
    collections::{HashMap, HashSet},
    future::Future,
    pin::Pin,
    sync::{Mutex, OnceLock},
    time::Instant,
};

use ddgs::{Ddgs, TextOptions};
use keyring::{credential::CredentialPersistence, Entry};
use neuink_config::{SearchProvider, WebSearchSettings};
use rs_trafilatura::{extract_with_options, ExtractResult, Options as PageExtractOptions};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use super::assistant::ToolDescriptor;
use super::settings::{read_settings, write_settings};

const CREDENTIAL_SERVICE: &str = "Neuink";
const CREDENTIAL_USER: &str = "tavily-api-token";
const CREDENTIAL_REF: &str = "keyring:tavily-api-token";
const ENV_API_TOKEN: &str = "TAVILY_API_TOKEN";
const TAVILY_ENDPOINT: &str = "https://api.tavily.com/search";
const ARXIV_ENDPOINT: &str = "https://export.arxiv.org/api/query";

// ---- request / response types -------------------------------------------------

#[derive(Clone, Debug, Deserialize)]
pub struct WebSearchRequest {
    pub query: String,
    #[serde(default)]
    pub top_k: Option<u32>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct WebSearchResponse {
    pub query: String,
    pub results: Vec<WebSearchResult>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ReadWebPageRequest {
    pub url: String,
    #[serde(default)]
    pub max_chars: Option<usize>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ReadWebPageResponse {
    pub url: String,
    pub title: String,
    pub markdown: String,
    pub markdown_char_count: usize,
    pub truncated: bool,
}

// ---- settings state -----------------------------------------------------------

#[derive(Clone, Debug, Serialize)]
pub struct WebSearchSettingsState {
    pub enabled: bool,
    pub providers: Vec<String>,
    pub tavily: TavilyState,
}

#[derive(Clone, Debug, Serialize)]
pub struct TavilyState {
    pub has_api_key: bool,
    pub token_source: Option<&'static str>,
}

#[derive(Debug, Deserialize)]
pub struct SaveWebSearchSettingsRequest {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub providers: Option<Vec<String>>,
    #[serde(default)]
    pub tavily_api_key: Option<String>,
    #[serde(default)]
    pub clear_tavily_api_key: bool,
}

// ---- tool descriptors + gating -------------------------------------------------

pub(crate) fn web_search_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: "web_search".to_string(),
        description: "Search the web for up-to-date information outside the local Neuink workspace through the enabled search providers (DuckDuckGo, arXiv, Tavily). Use this for current events, general knowledge, or external sources not present in the library."
            .to_string(),
        parameters_schema: json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "root": {"type": "string"},
                "query": {"type": "string", "minLength": 1, "maxLength": 4096},
                "top_k": {"type": "integer", "minimum": 1, "maximum": 20}
            },
            "required": ["root", "query"]
        }),
    }
}

pub(crate) fn read_web_page_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: "read_web_page".to_string(),
        description: "Fetch a single web URL with reqwest and extract its clean Markdown main-content text with rs-trafilatura (navigation and boilerplate stripped). Use this after web_search to retrieve the full body of a promising result so you can cite detailed, verifiable content instead of just the search snippet."
            .to_string(),
        parameters_schema: json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "root": {"type": "string"},
                "url": {"type": "string", "minLength": 1, "maxLength": 8192},
                "max_chars": {"type": "integer", "minimum": 100, "maximum": 200000}
            },
            "required": ["root", "url"]
        }),
    }
}

pub(crate) fn web_search_tools_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    read_settings(app)
        .ok()
        .map(|settings| web_search_enabled(&settings.web_search))
        .unwrap_or(false)
}

fn web_search_enabled(settings: &WebSearchSettings) -> bool {
    settings.enabled && !settings.providers.is_empty()
}

// ---- IPC: settings + credentials ----------------------------------------------

#[tauri::command]
pub fn get_web_search_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<WebSearchSettingsState, String> {
    let settings = read_settings(&app)?;
    Ok(web_search_settings_state(&settings.web_search))
}

#[tauri::command]
pub fn save_web_search_settings<R: Runtime>(
    app: AppHandle<R>,
    request: SaveWebSearchSettingsRequest,
) -> Result<WebSearchSettingsState, String> {
    let mut settings = read_settings(&app)?;
    let ws = &mut settings.web_search;

    if request.clear_tavily_api_key {
        delete_credential()?;
        ws.tavily_api_key_ref = None;
    } else if let Some(key) = request.tavily_api_key {
        let key = key.trim();
        if !key.is_empty() {
            persist_credential(key)?;
            ws.tavily_api_key_ref = Some(CREDENTIAL_REF.to_string());
        }
    }

    if let Some(providers) = request.providers {
        ws.providers = parse_providers(&providers)?;
    }

    if let Some(enabled) = request.enabled {
        ws.enabled = enabled;
    }

    if ws.enabled && ws.providers.is_empty() {
        return Err(
            "web search cannot be enabled until at least one search provider is selected."
                .to_string(),
        );
    }
    if ws.providers.contains(&SearchProvider::Tavily) && resolve_tavily_token(ws)?.is_none() {
        return Err(
            "Tavily is selected but no API key is configured. Save a Tavily API key or deselect Tavily."
                .to_string(),
        );
    }

    write_settings(&app, &settings)?;
    let state = web_search_settings_state(&settings.web_search);
    if state.tavily.token_source == Some("credential_store") && !state.tavily.has_api_key {
        return Err("Tavily credential was not readable after saving.".to_string());
    }
    Ok(state)
}

#[tauri::command]
pub fn reveal_tavily_api_token<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let settings = read_settings(&app)?;
    resolve_tavily_token(&settings.web_search)?
        .ok_or_else(|| "No Tavily API key is configured.".to_string())
}

#[tauri::command]
pub async fn test_web_search_provider<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
) -> Result<Value, String> {
    let provider = parse_single_provider(&provider)?;
    let settings = read_settings(&app)?;
    let http = web_http_client()?;
    let ddgs = web_search_client()?;
    let query = "web search";

    let count = match provider {
        SearchProvider::Duckduckgo => ddgs
            .text_with_options(query, TextOptions::default().max_results(3))
            .await
            .map_err(|error| format!("DuckDuckGo request failed: {error}"))?
            .len(),
        SearchProvider::Arxiv => search_arxiv(http, query, 3).await?.len(),
        SearchProvider::Tavily => {
            let key = resolve_tavily_token(&settings.web_search)?
                .ok_or_else(|| "Tavily is not configured with an API key.".to_string())?;
            search_tavily(http, &key, query, 3).await?.len()
        }
    };

    Ok(json!({ "provider": provider_name(&provider), "ok": true, "result_count": count }))
}

fn web_search_settings_state(settings: &WebSearchSettings) -> WebSearchSettingsState {
    let (has_api_key, token_source) = tavily_token_state(settings);
    WebSearchSettingsState {
        enabled: settings.enabled,
        providers: settings.providers.iter().map(provider_name).collect(),
        tavily: TavilyState {
            has_api_key,
            token_source,
        },
    }
}

fn tavily_token_state(settings: &WebSearchSettings) -> (bool, Option<&'static str>) {
    match settings.tavily_api_key_ref.as_deref() {
        Some(_) => match read_credential() {
            Ok(Some(_)) => (true, Some("credential_store")),
            _ => (false, Some("credential_store")),
        },
        None => match std::env::var(ENV_API_TOKEN) {
            Ok(value) if !value.trim().is_empty() => (true, Some("environment")),
            _ => (false, None),
        },
    }
}

fn resolve_tavily_token(settings: &WebSearchSettings) -> Result<Option<String>, String> {
    if settings.tavily_api_key_ref.as_deref() == Some(CREDENTIAL_REF) {
        if let Some(token) = read_credential()? {
            return Ok(Some(token));
        }
    }
    match std::env::var(ENV_API_TOKEN) {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value.trim().to_string())),
        _ => Ok(None),
    }
}

fn parse_providers(values: &[String]) -> Result<Vec<SearchProvider>, String> {
    let mut providers = Vec::with_capacity(values.len());
    for value in values {
        providers.push(parse_single_provider(value)?);
    }
    Ok(providers)
}

fn parse_single_provider(value: &str) -> Result<SearchProvider, String> {
    match value {
        "duckduckgo" => Ok(SearchProvider::Duckduckgo),
        "arxiv" => Ok(SearchProvider::Arxiv),
        "tavily" => Ok(SearchProvider::Tavily),
        other => Err(format!("unknown search provider: {other}")),
    }
}

fn provider_name(provider: &SearchProvider) -> String {
    match provider {
        SearchProvider::Duckduckgo => "duckduckgo".to_string(),
        SearchProvider::Arxiv => "arxiv".to_string(),
        SearchProvider::Tavily => "tavily".to_string(),
    }
}

// ---- invoke dispatch ----------------------------------------------------------

pub(crate) async fn invoke_web_search_tool<R: Runtime>(
    app: AppHandle<R>,
    args: Value,
) -> Result<Value, String> {
    let request: WebSearchRequest =
        serde_json::from_value(args).map_err(|error| error.to_string())?;
    let result = web_search(app, request).await?;
    serde_json::to_value(result).map_err(|error| error.to_string())
}

pub(crate) async fn invoke_read_web_page_tool(args: Value) -> Result<Value, String> {
    let request: ReadWebPageRequest =
        serde_json::from_value(args).map_err(|error| error.to_string())?;
    let result = read_web_page(request).await?;
    serde_json::to_value(result).map_err(|error| error.to_string())
}

// ---- web_search routing across providers ---------------------------------------

const WEB_SEARCH_CACHE_CAPACITY: usize = 512;

struct CachedWebSearch {
    stored_at: Instant,
    response: WebSearchResponse,
}

static WEB_SEARCH_CLIENT: OnceLock<Result<Ddgs, String>> = OnceLock::new();
static WEB_SEARCH_CACHE: OnceLock<Mutex<HashMap<String, CachedWebSearch>>> = OnceLock::new();

fn web_search_client() -> Result<&'static Ddgs, String> {
    WEB_SEARCH_CLIENT
        .get_or_init(|| Ddgs::new().map_err(|error| format!("web_search init failed: {error}")))
        .as_ref()
        .map_err(String::clone)
}

fn cached_web_search(key: &str) -> Option<WebSearchResponse> {
    WEB_SEARCH_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap()
        .get(key)
        .map(|entry| entry.response.clone())
}

fn store_web_search(key: String, response: WebSearchResponse) {
    let mut cache = WEB_SEARCH_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap();
    if cache.len() >= WEB_SEARCH_CACHE_CAPACITY && !cache.contains_key(&key) {
        if let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.stored_at)
            .map(|(oldest_key, _)| oldest_key.clone())
        {
            cache.remove(&oldest);
        }
    }
    cache.insert(
        key,
        CachedWebSearch {
            stored_at: Instant::now(),
            response,
        },
    );
}

async fn web_search<R: Runtime>(
    app: AppHandle<R>,
    request: WebSearchRequest,
) -> Result<WebSearchResponse, String> {
    let query = request.query.trim().to_string();
    if query.is_empty() {
        return Err("web_search requires a non-empty query".to_string());
    }
    let top_k = request.top_k.unwrap_or(8).clamp(1, 20) as usize;
    let started = std::time::Instant::now();

    let settings = read_settings(&app)?;
    if !web_search_enabled(&settings.web_search) {
        return Err("web search tools are disabled in Settings".to_string());
    }
    let providers = settings.web_search.providers.clone();

    let provider_key = providers
        .iter()
        .map(provider_name)
        .collect::<Vec<_>>()
        .join(",");
    let key = format!("{query}:{top_k}:{provider_key}");
    if let Some(cached) = cached_web_search(&key) {
        eprintln!(
            "[web_search] query={:?} providers=[{}] cache-hit elapsed={:?}",
            truncate_for_log(&query, 60),
            provider_key,
            started.elapsed()
        );
        return Ok(cached);
    }

    let ddgs = web_search_client()?;
    let http = web_http_client()?;
    let tavily_key = resolve_tavily_token(&settings.web_search)?;

    let provider_futures: Vec<
        Pin<Box<dyn Future<Output = Result<Vec<WebSearchResult>, String>> + Send>>,
    > = providers
        .iter()
        .map(|provider| {
            let query = query.clone();
            match provider {
                SearchProvider::Duckduckgo => {
                    let ddgs = ddgs.clone();
                    Box::pin(async move {
                        let hits = ddgs
                            .text_with_options(&query, TextOptions::default().max_results(top_k))
                            .await
                            .map_err(|error| format!("DuckDuckGo request failed: {error}"))?;
                        Ok(hits
                            .into_iter()
                            .map(|hit| WebSearchResult {
                                title: if hit.title.trim().is_empty() {
                                    hit.href.clone()
                                } else {
                                    hit.title
                                },
                                url: hit.href,
                                snippet: hit.body,
                            })
                            .collect::<Vec<_>>())
                    })
                        as Pin<
                            Box<dyn Future<Output = Result<Vec<WebSearchResult>, String>> + Send>,
                        >
                }
                SearchProvider::Arxiv => {
                    let http = http.clone();
                    Box::pin(async move { search_arxiv(&http, &query, top_k).await })
                        as Pin<
                            Box<dyn Future<Output = Result<Vec<WebSearchResult>, String>> + Send>,
                        >
                }
                SearchProvider::Tavily => {
                    let http = http.clone();
                    let key = tavily_key.clone().ok_or_else(|| {
                        "Tavily is selected but no API key is configured.".to_string()
                    });
                    Box::pin(async move {
                        let key = key?;
                        search_tavily(&http, &key, &query, top_k).await
                    })
                        as Pin<
                            Box<dyn Future<Output = Result<Vec<WebSearchResult>, String>> + Send>,
                        >
                }
            }
        })
        .collect();

    let provider_results = futures_util::future::join_all(provider_futures).await;

    let mut seen = HashSet::new();
    let mut results = Vec::new();
    let mut first_error: Option<String> = None;
    for per_provider in provider_results {
        let per_provider = match per_provider {
            Ok(per_provider) => per_provider,
            Err(error) => {
                first_error.get_or_insert(error);
                continue;
            }
        };
        for result in per_provider {
            let trimmed = result.url.trim();
            if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
                continue;
            }
            results.push(result);
            if results.len() >= top_k {
                break;
            }
        }
        if results.len() >= top_k {
            break;
        }
    }
    if results.is_empty() {
        if let Some(error) = first_error {
            return Err(error);
        }
    }

    let response = WebSearchResponse { query, results };
    store_web_search(key, response.clone());
    eprintln!(
        "[web_search] query={:?} providers=[{}] results={} elapsed={:?}",
        truncate_for_log(&response.query, 60),
        provider_key,
        response.results.len(),
        started.elapsed()
    );
    Ok(response)
}

// ---- arXiv (Atom feed) ---------------------------------------------------------

#[derive(Debug, Deserialize)]
struct TavilyResponse {
    results: Vec<TavilyResult>,
}

#[derive(Debug, Deserialize)]
struct TavilyResult {
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    content: String,
}

async fn search_tavily(
    http: &reqwest::Client,
    api_key: &str,
    query: &str,
    max_results: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let payload = json!({
        "api_key": api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": "basic"
    });
    let response: TavilyResponse = http
        .post(TAVILY_ENDPOINT)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Tavily request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Tavily request failed: {error}"))?
        .json()
        .await
        .map_err(|error| format!("Tavily response parse failed: {error}"))?;

    Ok(response
        .results
        .into_iter()
        .map(|result| WebSearchResult {
            title: if result.title.trim().is_empty() {
                result.url.clone()
            } else {
                result.title
            },
            url: result.url,
            snippet: result.content,
        })
        .collect())
}

async fn search_arxiv(
    http: &reqwest::Client,
    query: &str,
    max_results: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let query_params = url_query_encoder(query);
    let url = format!("{ARXIV_ENDPOINT}?search_query=all:{query_params}&max_results={max_results}");
    let body = http
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("arXiv request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("arXiv request failed: {error}"))?
        .text()
        .await
        .map_err(|error| format!("arXiv response read failed: {error}"))?;

    let doc = roxmltree::Document::parse(&body)
        .map_err(|error| format!("arXiv response parse failed: {error}"))?;
    let mut results = Vec::new();
    for entry in doc
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "entry")
    {
        let mut title = String::new();
        let mut url = String::new();
        let mut summary = String::new();
        for child in entry.children().filter(|node| node.is_element()) {
            match child.tag_name().name() {
                "id" => url = child.text().unwrap_or_default().trim().to_string(),
                "title" => title = child.text().unwrap_or_default().trim().to_string(),
                "summary" => {
                    summary = child
                        .text()
                        .map(|text| collapse_whitespace(text))
                        .unwrap_or_default()
                }
                _ => {}
            }
        }
        if url.is_empty() {
            continue;
        }
        results.push(WebSearchResult {
            title: if title.is_empty() { url.clone() } else { title },
            url,
            snippet: summary,
        });
    }
    Ok(results)
}

fn url_query_encoder(query: &str) -> String {
    // 用 reqwest::Url 做百分号编码，取回原始编码串（query() 不解码，保留 %20、&、# 等）。
    // arXiv 的 legacy query 接受 %20，无需转成 '+'。
    reqwest::Url::parse(&format!("https://example.test/?q={}", query))
        .map(|url| {
            url.query()
                .unwrap_or_default()
                .trim_start_matches("q=")
                .to_string()
        })
        .unwrap_or_default()
}

fn collapse_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut pending_space = false;
    for ch in text.chars() {
        if ch.is_whitespace() {
            pending_space = true;
        } else {
            if pending_space {
                out.push(' ');
                pending_space = false;
            }
            out.push(ch);
        }
    }
    out
}

// ---- read_web_page (fetches any URL, extractor) --------------------------------

/// rs-trafilatura 在极深的 DOM 上递归可能爆栈（默认线程栈约 1MB），
/// 因此提取正文单独跑在一个大栈线程上，避免被单个页面拖垮整个进程。
const WEB_PAGE_EXTRACT_STACK_BYTES: usize = 128 * 1024 * 1024;
/// 抓取上限：超大的 HTML 直接用高栈线程也吃紧，命中即报错跳过。
const WEB_PAGE_MAX_HTML_BYTES: usize = 3 * 1024 * 1024;
/// rs-trafilatura 对超长正文按字节截断，遇到多字节字符（如中文）会断言崩溃；
/// 这里把提取上限拉高（远高于 HTML 上限）以避开该崩溃路径，再由我们自行截断。
const WEB_PAGE_MAX_EXT_LEN: usize = 64 * 1024 * 1024;
/// 工具返回值上限，防止超大正文撑爆 IPC 与模型上下文。
const WEB_PAGE_MAX_RETURN_CHARS: usize = 200_000;

static WEB_HTTP_CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();

fn web_http_client() -> Result<&'static reqwest::Client, String> {
    WEB_HTTP_CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                     (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                )
                .connect_timeout(std::time::Duration::from_secs(10))
                .timeout(std::time::Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::limited(10))
                .build()
                .map_err(|error| format!("web http client init failed: {error}"))
        })
        .as_ref()
        .map_err(String::clone)
}

async fn read_web_page(request: ReadWebPageRequest) -> Result<ReadWebPageResponse, String> {
    let url = request.url.trim().to_string();
    if url.is_empty() {
        return Err("read_web_page requires a non-empty url".to_string());
    }
    let started = std::time::Instant::now();
    let log_url = truncate_for_log(request.url.trim(), 80);

    let client = web_http_client()?;

    // arXiv 链接（arxiv.org 或 export.arxiv.org 的 abs/pdf 页）走专门路径：
    // 先用 API 拉干净的 XML 元数据，再抓官方 HTML 全文，HTML 拿不到则退回摘要。
    if let Some(id) = arxiv_id_from_url(&url) {
        let result = read_arxiv_article(client, url, id, request.max_chars).await;
        eprintln!(
            "[read_web_page] kind=arxiv url={log_url} elapsed={:?}",
            started.elapsed()
        );
        return result;
    }

    // 通用路径（DuckDuckGo / Tavily / 任意普通网页）：下载 HTML + trafilatura 提取纯净正文。
    let result = read_generic_web_page(client, url, request.max_chars).await;
    eprintln!(
        "[read_web_page] kind=generic url={log_url} elapsed={:?}",
        started.elapsed()
    );
    result
}

/// 日志里裁剪过长的字符串，避免超长 query / url 刷屏。
fn truncate_for_log(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        let truncated: String = value.chars().take(max_chars).collect();
        format!("{truncated}…")
    }
}

/// 下载页面并按要求组装响应（长度截断）。
async fn read_generic_web_page(
    client: &reqwest::Client,
    url: String,
    max_chars: Option<usize>,
) -> Result<ReadWebPageResponse, String> {
    let html = fetch_html(client, &url).await?;
    let extracted = extract_on_big_stack(html)
        .map_err(|error| format!("trafilatura extract {url}: {error}"))?;
    let text = extracted.content_text.trim().to_string();
    if text.is_empty() {
        return Err(format!("no main content extracted from {url}"));
    }
    let title = extracted
        .metadata
        .title
        .unwrap_or_default()
        .trim()
        .to_string();
    Ok(build_response(url, title, text, max_chars))
}

/// 下载指定 URL 的原始 HTML。超大页面直接报错跳过，避免拖垮后续提取。
async fn fetch_html(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let html = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("fetch {url}: {error}"))?
        .error_for_status()
        .map_err(|error| format!("fetch {url}: {error}"))?
        .text()
        .await
        .map_err(|error| format!("read {url} body: {error}"))?;

    if html.len() > WEB_PAGE_MAX_HTML_BYTES {
        return Err(format!(
            "page too large ({} bytes > {} limit), skipped",
            html.len(),
            WEB_PAGE_MAX_HTML_BYTES
        ));
    }
    Ok(html)
}

/// 在独立的大栈线程上跑 trafilatura 提取；深 DOM 递归不会爆掉默认线程栈。
fn extract_on_big_stack(html: String) -> Result<ExtractResult, String> {
    let options = PageExtractOptions {
        max_extracted_len: WEB_PAGE_MAX_EXT_LEN,
        output_markdown: true,
        ..PageExtractOptions::default()
    };
    std::thread::Builder::new()
        .name("web-page-extract".into())
        .stack_size(WEB_PAGE_EXTRACT_STACK_BYTES)
        .spawn(move || extract_with_options(&html, &options))
        .map_err(|error| format!("could not spawn extraction thread: {error}"))?
        .join()
        .map_err(|_| "web page extraction thread panicked".to_string())?
        .map_err(|error| format!("{error}"))
}

/// 统一截断到上限并组装响应。
fn build_response(
    url: String,
    title: String,
    text: String,
    max_chars: Option<usize>,
) -> ReadWebPageResponse {
    let char_count = text.chars().count();
    let final_chars = max_chars
        .unwrap_or(WEB_PAGE_MAX_RETURN_CHARS)
        .min(WEB_PAGE_MAX_RETURN_CHARS);
    let truncated = char_count > final_chars;
    let markdown = if truncated {
        text.chars().take(final_chars).collect::<String>()
    } else {
        text
    };
    ReadWebPageResponse {
        url,
        title,
        markdown,
        markdown_char_count: char_count,
        truncated,
    }
}

// ---- arXiv 专用路径 ------------------------------------------------------------

/// 从 arxiv.org / export.arxiv.org 的 abs 或 pdf 链接里解析出论文编号。
fn arxiv_id_from_url(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();
    if host != "arxiv.org" && !host.ends_with(".arxiv.org") {
        return None;
    }
    let segments: Vec<&str> = parsed.path_segments()?.collect();
    // `abs/{编号}` 或 `pdf/{编号}` 之后的路径段整体作为编号（旧式编号含斜杠，如 hep-th/9901001）。
    let start = segments.iter().position(|s| *s == "abs" || *s == "pdf")? + 1;
    let rest = segments.get(start..)?.join("/");
    let id = rest.strip_suffix(".pdf").unwrap_or(&rest).to_string();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

/// arXiv API（Atom XML）返回的干净元数据。用于替代 HTML 摘要页上杂乱的爬虫结果。
struct ArxivMeta {
    title: String,
    authors: Vec<String>,
    abstract_text: String,
    published: String,
    doi: String,
}

async fn fetch_arxiv_metadata(
    client: &reqwest::Client,
    id: &str,
) -> Result<Option<ArxivMeta>, String> {
    let api_url = format!("{ARXIV_ENDPOINT}?id_list={id}");
    let body = client
        .get(&api_url)
        .send()
        .await
        .map_err(|error| format!("arXiv API request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("arXiv API request failed: {error}"))?
        .text()
        .await
        .map_err(|error| format!("arXiv API response read failed: {error}"))?;

    let doc = roxmltree::Document::parse(&body)
        .map_err(|error| format!("arXiv API response parse failed: {error}"))?;
    let entry = doc
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "entry");
    let Some(entry) = entry else {
        return Ok(None);
    };

    let mut meta = ArxivMeta {
        title: String::new(),
        authors: Vec::new(),
        abstract_text: String::new(),
        published: String::new(),
        doi: String::new(),
    };
    for child in entry.children().filter(|node| node.is_element()) {
        match child.tag_name().name() {
            "title" => meta.title = child.text().unwrap_or_default().trim().to_string(),
            "summary" => {
                meta.abstract_text = child.text().map(collapse_whitespace).unwrap_or_default()
            }
            "published" => meta.published = child.text().unwrap_or_default().trim().to_string(),
            "doi" => meta.doi = child.text().unwrap_or_default().trim().to_string(),
            "author" => {
                if let Some(name_node) = child
                    .children()
                    .find(|node| node.is_element() && node.tag_name().name() == "name")
                {
                    if let Some(name) = name_node
                        .text()
                        .map(|text| text.trim().to_string())
                        .filter(|text| !text.is_empty())
                    {
                        meta.authors.push(name);
                    }
                }
            }
            _ => {}
        }
    }
    Ok(Some(meta))
}

/// arXiv 论文：拼接干净的元数据头 + 官方 HTML 全文；HTML 拿不到就退回 API 摘要。
async fn read_arxiv_article(
    client: &reqwest::Client,
    url: String,
    id: String,
    max_chars: Option<usize>,
) -> Result<ReadWebPageResponse, String> {
    let meta = fetch_arxiv_metadata(client, &id)
        .await?
        .ok_or_else(|| format!("arXiv API returned no record for {id}"))?;

    let title = if meta.title.is_empty() {
        id.clone()
    } else {
        meta.title.clone()
    };
    let mut markdown = format!("# {title}\n");
    if !meta.authors.is_empty() {
        markdown.push_str(&format!("**作者**: {}\n", meta.authors.join(", ")));
    }
    if !meta.published.is_empty() {
        markdown.push_str(&format!("**日期**: {}\n", meta.published));
    }
    if !meta.doi.is_empty() {
        markdown.push_str(&format!(
            "**DOI**: {}  https://doi.org/{}\n",
            meta.doi, meta.doi
        ));
    }
    markdown.push_str(&format!("**arXiv**: https://arxiv.org/abs/{}\n", id));

    // arxiv.org/html/{id} 是新版论文的官方 HTML 全文；2023 年前的论文返回 404，退回摘要。
    let html_url = format!("https://arxiv.org/html/{id}");
    let body = match fetch_html(client, &html_url).await {
        Ok(html) => match extract_on_big_stack(html) {
            Ok(extracted) => extracted.content_text.trim().to_string(),
            Err(_) => String::new(),
        },
        Err(_) => String::new(),
    };

    markdown.push_str("\n\n");
    if body.is_empty() {
        if meta.abstract_text.is_empty() {
            return Err(format!("no full text or abstract available for arXiv {id}"));
        }
        markdown.push_str("> 未能获取 HTML 全文，以下为官方摘要：\n\n");
        markdown.push_str(&meta.abstract_text);
    } else {
        markdown.push_str("## 全文\n\n");
        markdown.push_str(&body);
    }

    Ok(build_response(url, title, markdown, max_chars))
}

// ---- keyring credential helpers (mirrors sciverse) ------------------------------

fn credential_entry() -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_USER).map_err(credential_error)
}

fn persist_credential(token: &str) -> Result<(), String> {
    ensure_persistent_credential_store()?;
    credential_entry()?
        .set_password(token)
        .map_err(credential_error)?;

    match read_credential()? {
        Some(persisted) if persisted == token => Ok(()),
        Some(_) => Err("Tavily credential verification returned different data.".to_string()),
        None => Err("Tavily credential was not readable after saving.".to_string()),
    }
}

fn ensure_persistent_credential_store() -> Result<(), String> {
    match keyring::default::default_credential_builder().persistence() {
        CredentialPersistence::UntilDelete => Ok(()),
        _ => Err(
            "Tavily requires a persistent system credential store, but this build is using a non-persistent credential backend."
                .to_string(),
        ),
    }
}

fn read_credential() -> Result<Option<String>, String> {
    normalize_credential_result(credential_entry()?.get_password())
}

fn normalize_credential_result(
    result: Result<String, keyring::Error>,
) -> Result<Option<String>, String> {
    match result {
        Ok(value) => Ok((!value.trim().is_empty()).then_some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(credential_error(error)),
    }
}

fn delete_credential() -> Result<(), String> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(credential_error(error)),
    }
}

fn credential_error(error: keyring::Error) -> String {
    format!("Tavily credential store error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider_set(values: &[&str]) -> Vec<SearchProvider> {
        parse_providers(&values.iter().map(|v| v.to_string()).collect::<Vec<_>>()).unwrap()
    }

    #[test]
    fn parses_provider_names() {
        assert_eq!(
            provider_set(&["arxiv", "duckduckgo", "tavily"]),
            vec![
                SearchProvider::Arxiv,
                SearchProvider::Duckduckgo,
                SearchProvider::Tavily
            ]
        );
        assert!(parse_providers(&["yandex".to_string()]).is_err());
    }

    #[test]
    fn web_search_requires_enabled_and_provider() {
        let enabled = WebSearchSettings {
            enabled: true,
            providers: provider_set(&["duckduckgo"]),
            tavily_api_key_ref: None,
        };
        assert!(web_search_enabled(&enabled));

        let disabled = WebSearchSettings {
            enabled: true,
            providers: vec![],
            tavily_api_key_ref: None,
        };
        assert!(!web_search_enabled(&disabled));

        let off = WebSearchSettings {
            enabled: false,
            providers: provider_set(&["arxiv"]),
            tavily_api_key_ref: None,
        };
        assert!(!web_search_enabled(&off));
    }

    #[test]
    fn parses_arxiv_id_from_various_url_shapes() {
        // 新版编号：abstract 页
        assert_eq!(
            arxiv_id_from_url("https://arxiv.org/abs/2101.12345"),
            Some("2101.12345".to_string())
        );
        // pdf 链接去掉 .pdf 后缀
        assert_eq!(
            arxiv_id_from_url("https://arxiv.org/pdf/2101.12345"),
            Some("2101.12345".to_string())
        );
        // 带版本号保留
        assert_eq!(
            arxiv_id_from_url("https://arxiv.org/abs/2101.12345v3"),
            Some("2101.12345v3".to_string())
        );
        // 旧式编号（hep-th/9901001）
        assert_eq!(
            arxiv_id_from_url("https://export.arxiv.org/abs/hep-th/9901001"),
            Some("hep-th/9901001".to_string())
        );
        // 非 arxiv 域名不识别
        assert_eq!(
            arxiv_id_from_url("https://example.com/abs/2101.12345"),
            None
        );
        // 空路径不识别
        assert_eq!(arxiv_id_from_url("https://arxiv.org/"), None);
    }

    #[test]
    fn fetch_arxiv_metadata_parses_atom_entry() {
        let body = r#"<feed xmlns="http://www.w3.org/2005/Atom"
             xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2101.12345v1</id>
    <title>A   Minimal   Title</title>
    <summary>First author line.
Second line.</summary>
    <published>2021-01-28T00:00:00Z</published>
    <author><name>Alice   Wu</name></author>
    <author><name>Bob Ross</name></author>
    <arxiv:doi>10.1000/xyz123</arxiv:doi>
  </entry>
</feed>"#;

        // 用 roxmltree 直接复刻 fetch_arxiv_metadata 的解析，验证字段映射与空白折叠。
        let doc = roxmltree::Document::parse(body).unwrap();
        let entry = doc
            .descendants()
            .find(|node| node.is_element() && node.tag_name().name() == "entry")
            .unwrap();

        let mut title = String::new();
        let mut summary = String::new();
        let mut published = String::new();
        let mut doi = String::new();
        let mut authors = Vec::new();
        for child in entry.children().filter(|node| node.is_element()) {
            match child.tag_name().name() {
                "title" => title = child.text().unwrap_or_default().trim().to_string(),
                "summary" => summary = child.text().map(collapse_whitespace).unwrap_or_default(),
                "published" => published = child.text().unwrap_or_default().trim().to_string(),
                "doi" => doi = child.text().unwrap_or_default().trim().to_string(),
                "author" => {
                    if let Some(name_node) = child
                        .children()
                        .find(|node| node.is_element() && node.tag_name().name() == "name")
                    {
                        if let Some(name) = name_node
                            .text()
                            .map(|text| text.trim().to_string())
                            .filter(|text| !text.is_empty())
                        {
                            authors.push(name);
                        }
                    }
                }
                _ => {}
            }
        }

        assert_eq!(title, "A   Minimal   Title"); // 标题保持原样（仅 trim）
        assert_eq!(summary, "First author line. Second line."); // 摘要的换行/空白折叠为单空格
        assert_eq!(published, "2021-01-28T00:00:00Z");
        assert_eq!(doi, "10.1000/xyz123");
        assert_eq!(
            authors,
            vec!["Alice   Wu".to_string(), "Bob Ross".to_string()]
        );
    }

    #[test]
    fn dedupes_by_url_keeping_provider_priority() {
        let candidates = vec![
            WebSearchResult {
                title: "A".into(),
                url: "https://x".into(),
                snippet: "1".into(),
            },
            WebSearchResult {
                title: "B".into(),
                url: "https://x".into(),
                snippet: "2".into(),
            },
            WebSearchResult {
                title: "".into(),
                url: "https://y".into(),
                snippet: "3".into(),
            },
        ];
        let mut seen = HashSet::new();
        let merged = candidates
            .into_iter()
            .filter(|r| !r.url.trim().is_empty() && seen.insert(r.url.trim().to_string()))
            .collect::<Vec<_>>();
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].title, "A");
        // Second candidate shares A's URL and is dropped; the URL-less candidate is kept.
        assert_eq!(merged[1].url, "https://y");
        assert!(seen.contains("https://x"));
    }
}
