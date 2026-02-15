import { describe, expect, it } from 'vitest'
import {
    CATEGORY_MAP,
    HIDDEN_PORT_NAMES,
    HIDDEN_PORT_TYPES,
    LOADOUT_CATEGORY_ORDER,
    getCategoryInfo,
} from '../src/utils/constants'

describe('CATEGORY_MAP', () => {
  it('contains expected weapon types', () => {
    expect(CATEGORY_MAP.WeaponGun).toBeDefined()
    expect(CATEGORY_MAP.WeaponGun.label).toBe('Weapons')
    expect(CATEGORY_MAP.WeaponGun.order).toBe(1)
  })

  it('contains shields', () => {
    expect(CATEGORY_MAP.Shield).toBeDefined()
    expect(CATEGORY_MAP.Shield.label).toBe('Shields')
  })

  it('contains quantum drive', () => {
    expect(CATEGORY_MAP.QuantumDrive).toBeDefined()
    expect(CATEGORY_MAP.QuantumDrive.label).toBe('Quantum Drive')
  })

  it('has unique order values per category group', () => {
    const orders = new Set(Object.values(CATEGORY_MAP).map(c => c.order))
    // At least 8 distinct order levels
    expect(orders.size).toBeGreaterThanOrEqual(8)
  })
})

describe('getCategoryInfo', () => {
  it('returns category for known type', () => {
    const info = getCategoryInfo('Shield')
    expect(info.label).toBe('Shields')
    expect(info.icon).toBe('🛡️')
  })

  it('returns fallback for unknown type', () => {
    const info = getCategoryInfo('UnknownType')
    expect(info.label).toBe('UnknownType')
    expect(info.order).toBe(99)
  })
})

describe('LOADOUT_CATEGORY_ORDER', () => {
  it('starts with weapons', () => {
    expect(LOADOUT_CATEGORY_ORDER[0]).toBe('WeaponGun')
  })

  it('contains all expected categories', () => {
    expect(LOADOUT_CATEGORY_ORDER).toContain('Shield')
    expect(LOADOUT_CATEGORY_ORDER).toContain('QuantumDrive')
    expect(LOADOUT_CATEGORY_ORDER).toContain('PowerPlant')
    expect(LOADOUT_CATEGORY_ORDER).toContain('Cooler')
  })
})

describe('HIDDEN_PORT_TYPES', () => {
  it('hides fuel and life support ports', () => {
    expect(HIDDEN_PORT_TYPES.has('FuelIntake')).toBe(true)
    expect(HIDDEN_PORT_TYPES.has('LifeSupport')).toBe(true)
  })

  it('does not hide weapons', () => {
    expect(HIDDEN_PORT_TYPES.has('WeaponGun')).toBe(false)
  })
})

describe('HIDDEN_PORT_NAMES', () => {
  it('hides controller/display/seat names', () => {
    expect(HIDDEN_PORT_NAMES.has('controller')).toBe(true)
    expect(HIDDEN_PORT_NAMES.has('seat')).toBe(true)
    expect(HIDDEN_PORT_NAMES.has('display')).toBe(true)
  })
})
