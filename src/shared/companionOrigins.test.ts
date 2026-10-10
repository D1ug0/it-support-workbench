import { describe, expect, it } from 'vitest'
import { getCompanionOrigins, localCompanionOrigins } from './companionOrigins'

describe('deployment companion origins', () => {
  it('allows only the local service by default and one explicit deployment', () => {
    expect(getCompanionOrigins()).toEqual(localCompanionOrigins)
    expect(getCompanionOrigins('https://study.example:8443/')).toEqual([
      ...localCompanionOrigins,
      'https://study.example:8443',
    ])
  })
  it.each([
    'http://study.example',
    "https://a'unsafe.example",
    'https://user:password@study.example',
    'https://study.example/api',
    'https://study.example/?secret=1',
    'https://study.example/#fragment',
    'https://*.example',
    'https://study.example;connect-src',
  ])('rejects credentials, paths, wildcards and CSP injection: %s', (value) => {
    expect(() => getCompanionOrigins(value)).toThrow()
  })
})
