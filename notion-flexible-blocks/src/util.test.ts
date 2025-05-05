import { describe, it, expect } from 'vitest'
import { supportedLanguage } from './util.js'

describe('supportedLanguage', () => {
  it('should return the language name itself for supported languages', () => {
    expect(supportedLanguage('javascript')).toBe('javascript')
  })

  it('should return the canonical language name for aliases', () => {
    expect(supportedLanguage('js')).toBe('javascript')
  })

  it('should return null for unknown languages', () => {
    expect(supportedLanguage('unknown')).toBeNull()
  })
})
