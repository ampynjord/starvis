import { describe, expect, it } from 'vitest'
import { fmt, pct, portLabel } from '../src/utils/formatters'

describe('fmt', () => {
  it('returns — for null/undefined', () => {
    expect(fmt(null)).toBe('—')
    expect(fmt(undefined)).toBe('—')
  })

  it('returns — for NaN strings', () => {
    expect(fmt('abc')).toBe('—')
  })

  it('formats zero', () => {
    expect(fmt(0)).toBe('0')
  })

  it('formats small numbers with locale', () => {
    expect(fmt(123.456, 1)).toBe('123.5')
    expect(fmt(9999, 0)).toBe('9,999')
  })

  it('formats thousands with k suffix', () => {
    expect(fmt(15000)).toBe('15.0k')
    expect(fmt(123456)).toBe('123.5k')
  })

  it('formats millions with M suffix', () => {
    expect(fmt(1500000)).toBe('1.5M')
    expect(fmt(2345678)).toBe('2.3M')
  })

  it('appends unit when provided', () => {
    expect(fmt(42, 0, 'm/s')).toBe('42 m/s')
  })

  it('does not append unit for null values', () => {
    expect(fmt(null, 0, 'm/s')).toBe('—')
  })
})

describe('pct', () => {
  it('converts 0-1 ratio to percentage', () => {
    expect(pct(0.42)).toBe('42%')
    expect(pct(1)).toBe('100%')
    expect(pct(0)).toBe('0%')
  })
})

describe('portLabel', () => {
  it('cleans hardpoint_ prefix and formats', () => {
    expect(portLabel('hardpoint_weapon_gun')).toBe('Weapon Gun')
  })

  it('replaces underscores with spaces', () => {
    expect(portLabel('turret_top_left')).toBe('Turret Top Left')
  })
})
