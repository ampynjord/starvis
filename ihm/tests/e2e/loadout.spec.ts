import { expect, type Page, test } from '@playwright/test';
import { gotoApp } from './helpers';

/**
 * E2E Default Loadout — tree hierarchy, Modules tab, Specialized (MOLE ore bags).
 * Tagged @critical for quality:audit:ui.
 */

const GLADIUS_UUID = 'ship-gladius-loadout';
const AURORA_MK2_UUID = 'ship-aurora-mk2-loadout';
const MOLE_UUID = 'ship-mole-loadout';

type Json = Record<string, unknown>;

const shipBase = (uuid: string, name: string, extras: Json = {}) => ({
  uuid,
  name,
  manufacturer_code: 'AEGS',
  manufacturer_name: 'Aegis Dynamics',
  role: 'Fighter',
  career: 'Combat',
  vehicle_category: 'ship',
  status: 'flight-ready',
  crew_size: 1,
  cargo_capacity: 0,
  scm_speed: 220,
  max_speed: 1235,
  total_hp: 4200,
  size_x: 10,
  size_y: 20,
  size_z: 5,
  ...extras,
});

const emptyChildren = [] as unknown[];

/** Hardpoint → Gimbal → Weapon, Hardpoint → Rack → Missile, Quantum ≠ Jump. */
const gladiusLoadout = [
  {
    id: 1,
    parent_id: null,
    port_name: 'hardpoint_weapon_nose',
    port_type: 'Gimbal',
    port_min_size: 3,
    port_max_size: 3,
    component_uuid: 'gimbal-varipuck',
    component_name: 'VariPuck S3',
    component_type: 'Gimbal',
    component_size: 3,
    component_class_name: 'GimbalMount_S3',
    sub_type: null,
    grade: 'C',
    component_class: 'Civilian',
    manufacturer_code: 'BEHR',
    children: emptyChildren,
  },
  {
    id: 2,
    parent_id: 1,
    port_name: 'hardpoint_class_2',
    port_type: 'WeaponGun',
    port_min_size: 3,
    port_max_size: 3,
    component_uuid: 'weapon-panther',
    component_name: 'Panther',
    component_type: 'WeaponGun',
    component_size: 3,
    component_class_name: 'BEHR_LaserCannon_S3',
    sub_type: null,
    grade: 'B',
    component_class: 'Military',
    manufacturer_code: 'BEHR',
    weapon_dps: 400,
    weapon_damage: 80,
    weapon_fire_rate: 300,
    weapon_range: 2800,
    weapon_ammo_count: null,
    weapon_damage_type: 'energy',
    children: emptyChildren,
  },
  {
    id: 10,
    parent_id: null,
    port_name: 'hardpoint_missile_rack_01',
    port_type: 'MissileRack',
    port_min_size: 2,
    port_max_size: 2,
    component_uuid: 'rack-s2',
    component_name: 'MSD-221',
    component_type: 'MissileRack',
    component_size: 2,
    component_class_name: 'MRCK_S02_BEHR',
    sub_type: null,
    grade: 'C',
    component_class: 'Military',
    manufacturer_code: 'BEHR',
    children: emptyChildren,
  },
  {
    id: 11,
    parent_id: 10,
    port_name: 'missile_01_attach',
    port_type: 'Missile',
    port_min_size: 2,
    port_max_size: 2,
    component_uuid: 'missile-strike',
    component_name: 'StrikeForce II',
    component_type: 'Missile',
    component_size: 2,
    component_class_name: 'MISL_S02_BEHR',
    sub_type: null,
    grade: 'B',
    component_class: 'Military',
    manufacturer_code: 'BEHR',
    children: emptyChildren,
  },
  {
    id: 20,
    parent_id: null,
    port_name: 'hardpoint_quantum_drive',
    port_type: 'QuantumDrive',
    port_min_size: 1,
    port_max_size: 1,
    component_uuid: 'qd-beacon',
    component_name: 'Beacon',
    component_type: 'QuantumDrive',
    component_size: 1,
    component_class_name: 'QDRV_JUST_Beacon',
    sub_type: null,
    grade: 'C',
    component_class: 'Civilian',
    manufacturer_code: 'JUST',
    qd_speed: 140000,
    qd_spool_time: 4.2,
    qd_range: 8.5e9,
    children: emptyChildren,
  },
  {
    id: 21,
    parent_id: 20,
    port_name: 'hardpoint_jump_drive',
    port_type: 'JumpModule',
    port_min_size: 1,
    port_max_size: 1,
    component_uuid: 'jump-explorer',
    component_name: 'Explorer',
    component_type: 'JumpModule',
    component_size: 1,
    component_class_name: 'JMPD_JUST_Explorer',
    sub_type: null,
    grade: 'C',
    component_class: 'Civilian',
    manufacturer_code: 'JUST',
    children: emptyChildren,
  },
];

const auroraMk2 = shipBase(AURORA_MK2_UUID, 'Aurora Mk II', {
  manufacturer_code: 'RSI',
  manufacturer_name: 'Roberts Space Industries',
  role: 'Starter',
  career: 'Multi',
});

const auroraModules = [
  {
    id: 1,
    ship_uuid: AURORA_MK2_UUID,
    slot_name: 'hardpoint_front_module',
    slot_display_name: 'Front Module',
    slot_type: 'Module',
    module_class_name: 'RSI_Aurora_Mk2_Module_Cargo',
    module_name: 'Cargo',
    module_tier: 1,
    module_uuid: 'mod-cargo',
    is_default: true,
    loadout_json: null,
  },
  {
    id: 2,
    ship_uuid: AURORA_MK2_UUID,
    slot_name: 'hardpoint_front_module',
    slot_display_name: 'Front Module',
    slot_type: 'Module',
    module_class_name: 'RSI_Aurora_Mk2_Module_Living',
    module_name: 'Living',
    module_tier: 1,
    module_uuid: 'mod-living',
    is_default: false,
    loadout_json: null,
  },
];

const auroraLoadoutDefault = [
  {
    id: 100,
    parent_id: null,
    port_name: 'hardpoint_front_module',
    port_type: 'Other',
    port_min_size: 1,
    port_max_size: 1,
    component_uuid: 'mod-cargo',
    component_name: 'Cargo Bay',
    component_type: 'Module',
    component_size: 1,
    component_class_name: 'RSI_Aurora_Mk2_Module_Cargo',
    sub_type: null,
    grade: null,
    component_class: null,
    manufacturer_code: 'RSI',
    children: emptyChildren,
  },
  {
    id: 101,
    parent_id: null,
    port_name: 'hardpoint_shield_left',
    port_type: 'Shield',
    port_min_size: 1,
    port_max_size: 1,
    component_uuid: 'shield-allstop',
    component_name: 'AllStop',
    component_type: 'Shield',
    component_size: 1,
    component_class_name: 'SHLD_GODI_AllStop',
    sub_type: null,
    grade: 'C',
    component_class: 'Civilian',
    manufacturer_code: 'GODI',
    shield_hp: 4200,
    shield_regen: 120,
    shield_regen_delay: 2,
    children: emptyChildren,
  },
];

const auroraLoadoutLiving = auroraLoadoutDefault.map((node) =>
  node.id === 100
    ? {
        ...node,
        component_uuid: 'mod-living',
        component_name: 'Living Quarters',
        component_class_name: 'RSI_Aurora_Mk2_Module_Living',
      }
    : node,
);

const mole = shipBase(MOLE_UUID, 'MOLE', {
  manufacturer_code: 'ARGO',
  manufacturer_name: 'ARGO Astronautics',
  role: 'Mining',
  career: 'Industrial',
  cargo_capacity: 96,
});

const moleLoadout = Array.from({ length: 8 }, (_, i) => ({
  id: 200 + i,
  parent_id: null,
  port_name: `hardpoint_mining_pod_${i + 1}`,
  port_type: 'Other',
  port_min_size: 1,
  port_max_size: 1,
  component_uuid: `mole-bag-${i + 1}`,
  component_name: 'MOLE Ore Bag',
  component_type: 'Cargo',
  component_size: 1,
  component_class_name: 'Cargo_ShipMining_Pod_Mole',
  sub_type: null,
  grade: null,
  component_class: 'Industrial',
  manufacturer_code: 'ARGO',
  children: emptyChildren,
})).concat([
  {
    id: 300,
    parent_id: null,
    port_name: 'hardpoint_mining_arm_left',
    port_type: 'WeaponMining',
    port_min_size: 2,
    port_max_size: 2,
    component_uuid: 'mining-helix',
    component_name: 'Helix I',
    component_type: 'WeaponMining',
    component_size: 2,
    component_class_name: 'Mining_Laser_HELI',
    sub_type: null,
    grade: 'C',
    component_class: 'Industrial',
    manufacturer_code: 'HELI',
    children: emptyChildren,
  },
]);

async function installLoadoutFixtures(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { user: null } });
  });

  await page.route('**/api/public/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/+$/, '');
    const modulesParam = url.searchParams.get('modules') ?? '';

    if (path.endsWith('/version') || path.endsWith('/stats/overview')) {
      return route.fulfill({
        json: {
          success: true,
          data: path.endsWith('/version')
            ? { game_version: '4.10.2', game_env: 'live', extracted_at: '2026-10-01T10:00:00.000Z' }
            : { ships: 3, components: 0, items: 0, commodities: 0 },
        },
      });
    }

    const shipMatch = path.match(/\/ships\/([^/]+)(?:\/(loadout|modules|paints|similar))?$/);
    if (shipMatch) {
      const uuid = decodeURIComponent(shipMatch[1]);
      const sub = shipMatch[2];

      if (uuid === GLADIUS_UUID) {
        if (sub === 'loadout') return route.fulfill({ json: { success: true, data: gladiusLoadout } });
        if (sub === 'modules' || sub === 'paints' || sub === 'similar') {
          return route.fulfill({ json: { success: true, data: [] } });
        }
        return route.fulfill({ json: { success: true, data: shipBase(GLADIUS_UUID, 'Gladius') } });
      }

      if (uuid === AURORA_MK2_UUID) {
        if (sub === 'modules') return route.fulfill({ json: { success: true, data: auroraModules } });
        if (sub === 'loadout') {
          const data = modulesParam.includes('Living') ? auroraLoadoutLiving : auroraLoadoutDefault;
          return route.fulfill({ json: { success: true, data } });
        }
        if (sub === 'paints' || sub === 'similar') return route.fulfill({ json: { success: true, data: [] } });
        return route.fulfill({ json: { success: true, data: auroraMk2 } });
      }

      if (uuid === MOLE_UUID) {
        if (sub === 'loadout') return route.fulfill({ json: { success: true, data: moleLoadout } });
        if (sub === 'modules' || sub === 'paints' || sub === 'similar') {
          return route.fulfill({ json: { success: true, data: [] } });
        }
        return route.fulfill({ json: { success: true, data: mole } });
      }
    }

    if (path.includes('/objects/')) {
      return route.fulfill({
        json: { success: true, data: { data: {}, related: { buy_locations: [] } } },
      });
    }

    return route.fulfill({ json: { success: true, data: [] } });
  });
}

test.describe('@critical ship loadout', () => {
  test.beforeEach(async ({ page }) => {
    await installLoadoutFixtures(page);
    await page.addInitScript(() => {
      localStorage.setItem('starvis-lang', 'en');
    });
  });

  test('Default Loadout tree: Hardpoint→Gimbal→Weapon, Rack→Missile, Quantum≠Jump', async ({ page }) => {
    await gotoApp(page, `/ships/${GLADIUS_UUID}`);
    await expect(page.getByText('Gladius').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Default Loadout|Loadout par défaut/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Fixed Weapons|Armes Fixes/i }).click();
    await expect(page.getByText(/Weapon Hardpoint|Point d.arme/i).first()).toBeVisible();
    await expect(page.getByText('VariPuck S3').first()).toBeVisible();
    await expect(page.getByText('Panther').first()).toBeVisible();

    await page.getByRole('button', { name: /Ordnance|Munitions/i }).click();
    await expect(page.getByText('MSD-221').first()).toBeVisible();
    await expect(page.getByText('StrikeForce II').first()).toBeVisible();

    await page.getByRole('button', { name: /Quantum & Jump|Quantique & Saut/i }).click();
    await expect(page.getByText('Beacon').first()).toBeVisible();
    await expect(page.getByText('Explorer').first()).toBeVisible();
    await expect(page.getByText(/Jump Module|Module de saut/i).first()).toBeVisible();
    await expect(page.getByText(/Quantum Drive|Moteur quantique/i).first()).toBeVisible();
  });

  test('Modules tab: swap Aurora Mk2 module', async ({ page }) => {
    await gotoApp(page, `/ships/${AURORA_MK2_UUID}`);
    await expect(page.getByText('Aurora Mk II').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Default Loadout|Loadout par défaut/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Modules/i }).click();
    const select = page.getByLabel(/Choose module|Choisir le module/i);
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('RSI_Aurora_Mk2_Module_Cargo');

    await select.selectOption('RSI_Aurora_Mk2_Module_Living');
    await expect(select).toHaveValue('RSI_Aurora_Mk2_Module_Living');
    await expect(page.getByText(/Custom|Personnalisé/i).first()).toBeVisible();
  });

  test('Specialized tab: MOLE ore bags grouped under mining', async ({ page }) => {
    await gotoApp(page, `/ships/${MOLE_UUID}`);
    await expect(page.getByText('MOLE').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Default Loadout|Loadout par défaut/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Specialized|Spécialisé/i }).click();
    await expect(page.getByText(/Mining — Laser Heads, Arms & Ore Bags|Minage — têtes laser/i).first()).toBeVisible();
    await expect(page.getByText(/8x\s+(MOLE Ore Bag|Removable Ore Bag|Sac à minerai)/i).first()).toBeVisible();
    await expect(page.getByText('Helix I').first()).toBeVisible();
  });
});
