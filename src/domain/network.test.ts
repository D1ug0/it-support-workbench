import { describe, it, expect } from 'vitest'
import {
  isIPv4,
  isIPv6,
  maskToPrefix,
  prefixToMask,
  calculateSubnet,
  canonicalAddress,
} from './network'

describe('IP validation', () => {
  it.each(['0.0.0.0', '255.255.255.255', '192.0.2.10', '169.254.12.1', '127.0.0.1'])(
    'accepts IPv4 %s',
    (value) => expect(isIPv4(value)).toBe(true),
  )
  it.each(['999.1.1.1', '1.2.3', '01.2.3.4', '-1.2.3.4', '1.2.3.a', '1.2.3.4.5', '1.2.3.256'])(
    'rejects IPv4 %s',
    (value) => expect(isIPv4(value)).toBe(false),
  )
  it.each([
    '::',
    '::1',
    '2001:db8::1',
    'fe80::123%12',
    '1:2:3:4:5:6:7:8',
    '::ffff:192.0.2.1',
    'fe80::1%Ethernet',
  ])('accepts IPv6 %s', (value) => expect(isIPv6(value)).toBe(true))
  it.each([
    ':::1',
    '1::2::3',
    '1:2:3',
    '1:2:3:4:5:6:7:8:9',
    'gggg::1',
    '1:2:3:4:5:6:7:8::',
    '::1%',
    '::1%%2',
    '::ffff:999.0.0.1',
    '192.0.2.1',
    '1:2:3:4:5:6:7:',
    '12345::1',
  ])('rejects IPv6 %s', (value) => expect(isIPv6(value)).toBe(false))
  it.each(Array.from({ length: 33 }, (_, i) => i))('round-trips prefix /%i', (prefix) =>
    expect(maskToPrefix(prefixToMask(prefix))).toBe(prefix),
  )
  it.each(['255.0.255.0', '255.255.128.1', '999.255.0.0'])('rejects mask %s', (mask) =>
    expect(maskToPrefix(mask)).toBeUndefined(),
  )
  it.each([-1, 33, 1.5, NaN])('rejects prefix %s', (prefix) =>
    expect(() => prefixToMask(prefix)).toThrow(),
  )
})
describe('canonical address identity', () => {
  it.each([
    ['::', '0:0:0:0:0:0:0:0'],
    ['FD00:0000:0::0001', 'fd00:0:0:0:0:0:0:1'],
    ['::ffff:192.0.2.1', '0:0:0:0:0:ffff:c000:201'],
    ['1:2:3:4:5:6:192.0.2.1', '1:2:3:4:5:6:c000:201'],
    ['fe80::1%12', 'fe80:0:0:0:0:0:0:1%12'],
    ['192.0.2.1', '192.0.2.1'],
    ['[IPv6 1]', '[IPv6 1]'],
    ['2001:db8:bad-address', '2001:db8:bad-address'],
  ])('normalizes %s', (value, expected) => expect(canonicalAddress(value)).toBe(expected))
})
describe('CIDR calculator', () => {
  it('calculates network and broadcast', () =>
    expect(calculateSubnet('192.0.2.129', 25)).toMatchObject({
      network: '192.0.2.128',
      broadcast: '192.0.2.255',
      firstHost: '192.0.2.129',
      lastHost: '192.0.2.254',
      hosts: 126,
      wildcard: '0.0.0.127',
    }))
  it('handles /31 point-to-point', () =>
    expect(calculateSubnet('192.0.2.11', 31)).toMatchObject({
      network: '192.0.2.10',
      firstHost: '192.0.2.10',
      lastHost: '192.0.2.11',
      hosts: 2,
    }))
  it('handles /32 host route', () =>
    expect(calculateSubnet('192.0.2.10', 32)).toMatchObject({
      network: '192.0.2.10',
      firstHost: '192.0.2.10',
      lastHost: '192.0.2.10',
      hosts: 1,
    }))
  it('handles /0 without signed overflow', () =>
    expect(calculateSubnet('203.0.113.10', 0)).toMatchObject({
      network: '0.0.0.0',
      broadcast: '255.255.255.255',
      hosts: 4294967294,
    }))
  it('rejects invalid addresses', () => expect(() => calculateSubnet('hello', 24)).toThrow())
})
