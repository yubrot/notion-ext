import { setTimeout } from 'timers/promises'
import { APIErrorCode, APIResponseError, RequestTimeoutError } from '@notionhq/client'

// See https://developers.notion.com/reference/request-limits
const MAX_URL_LENGTH = 2000
const DEFAULT_RETRY_COUNT = 12 // enough count for rate limits with exponential backoff
const DEFAULT_RETRYABLE_ERROR_CODES = [
  APIErrorCode.ConflictError,
  APIErrorCode.RateLimited,
  APIErrorCode.InternalServerError,
  APIErrorCode.ServiceUnavailable,
]

/**
 * Retry policy for Notion API.
 */
export type Retryable = <T>(action: () => Promise<T>) => Promise<T>

export const defaultRetryable: Retryable = async <T>(action: () => Promise<T>) => {
  for (let i = 0; i < DEFAULT_RETRY_COUNT; ++i) {
    try {
      return await action()
    } catch (e) {
      const isRetryableError =
        RequestTimeoutError.isRequestTimeoutError(e) ||
        (APIResponseError.isAPIResponseError(e) && DEFAULT_RETRYABLE_ERROR_CODES.includes(e.code))

      if (!isRetryableError) throw e
    }

    await setTimeout(1000 * 2 ** i)
  }
  return await action()
}

/**
 * Convert a Notion page ID to a URL.
 */
export function toPageUrl(notionPageId: string) {
  return `https://www.notion.so/${notionPageId.replaceAll('-', '')}`
}

/**
 * Normalize URL for Notion.
 */
export function toEmbeddableUrl(url: string, baseUrl?: string): string | null {
  try {
    url = new URL(url, baseUrl).href
    return MAX_URL_LENGTH <= url.length ? null : url
  } catch {
    return null
  }
}

export type SupportedLanguage = (typeof supportedLanguages)[number]

export const supportedLanguages = [
  'abap',
  'arduino',
  'bash',
  'basic',
  'c',
  'clojure',
  'coffeescript',
  'c++',
  'c#',
  'css',
  'dart',
  'diff',
  'docker',
  'elixir',
  'elm',
  'erlang',
  'flow',
  'fortran',
  'f#',
  'gherkin',
  'glsl',
  'go',
  'graphql',
  'groovy',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'julia',
  'kotlin',
  'latex',
  'less',
  'lisp',
  'livescript',
  'lua',
  'makefile',
  'markdown',
  'markup',
  'matlab',
  'mermaid',
  'nix',
  'objective-c',
  'ocaml',
  'pascal',
  'perl',
  'php',
  'plain text',
  'powershell',
  'prolog',
  'protobuf',
  'python',
  'r',
  'reason',
  'ruby',
  'rust',
  'sass',
  'scala',
  'scheme',
  'scss',
  'shell',
  'sql',
  'swift',
  'typescript',
  'vb.net',
  'verilog',
  'vhdl',
  'visual basic',
  'webassembly',
  'xml',
  'yaml',
  'java/c/c++/c#',
] as const

/**
 * Normalize to a definition name that Notion can understand.
 */
export function supportedLanguage(lang?: string | null): SupportedLanguage | null {
  if (!lang) return null

  return supportedLanguageNormalization[lang.toLowerCase()] || null
}

const supportedLanguageNormalization: Record<string, SupportedLanguage> = {
  sh: 'shell',
  'shell-script': 'shell',
  bash: 'shell',
  zsh: 'shell',
  text: 'vb.net',
  c_cpp: 'c++',
  coffee: 'coffeescript',
  'coffee-script': 'coffeescript',
  cpp: 'c++',
  csharp: 'c#',
  cake: 'c#',
  cakescript: 'c#',
  udiff: 'diff',
  dockerfile: 'docker',
  fsharp: 'f#',
  cucumber: 'gherkin',
  golang: 'go',
  xhtml: 'html',
  java: 'java/c/c++/c#',
  js: 'javascript',
  node: 'javascript',
  tex: 'latex',
  lisp: 'webassembly',
  'live-script': 'livescript',
  ls: 'livescript',
  bsdmake: 'makefile',
  make: 'makefile',
  mf: 'makefile',
  pandoc: 'markdown',
  octave: 'matlab',
  nixos: 'nix',
  objectivec: 'objective-c',
  'obj-c': 'objective-c',
  objc: 'objective-c',
  delphi: 'pascal',
  objectpascal: 'pascal',
  cperl: 'perl',
  inc: 'php',
  posh: 'powershell',
  pwsh: 'powershell',
  'Protocol Buffers': 'protobuf',
  python3: 'python',
  rusthon: 'python',
  R: 'r',
  Rscript: 'r',
  splus: 'r',
  jruby: 'ruby',
  macruby: 'ruby',
  rake: 'ruby',
  rb: 'ruby',
  rbx: 'ruby',
  rs: 'rust',
  ts: 'typescript',
  'visual basic': 'vb.net',
  vbnet: 'vb.net',
  'vb .net': 'vb.net',
  'vb.net': 'vb.net',
  wast: 'webassembly',
  wasm: 'webassembly',
  rss: 'xml',
  xsd: 'xml',
  wsdl: 'xml',
}

for (const lang of supportedLanguages) supportedLanguageNormalization[lang] = lang
