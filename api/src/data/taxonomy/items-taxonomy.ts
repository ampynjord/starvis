export const FPS_ALL_TYPES = [
  'FPS_Weapon',
  'Armor',
  'Armor_Helmet',
  'Armor_Torso',
  'Armor_Arms',
  'Armor_Legs',
  'Armor_Backpack',
  'Undersuit',
  'Tool',
  'Consumable',
  'Magazine',
  'Attachment',
  'Gadget',
  'Clothing',
];

export const FPS_COVERED_TYPES = new Set([...FPS_ALL_TYPES, 'Armor']);

export const CHIP_SUBTYPES = ['Hacking', 'SystemAccess'];
export const CONSUMABLE_SUBTYPE_ORDER = ['Food', 'Drink', 'Medical', 'MedPack', 'OxygenCap', 'Stim'];

export const TAXONOMY_GROUPS: Record<string, { types: string[]; subTypes?: string[]; excludeSubTypes?: string[] }> = {
  armor_all: { types: ['Armor', 'Armor_Helmet', 'Armor_Torso', 'Armor_Arms', 'Armor_Legs', 'Armor_Backpack', 'Undersuit'] },
  clothing_all: { types: ['Clothing'] },
  weapons_all: { types: ['FPS_Weapon'], excludeSubTypes: ['Throwable', 'Mine'] },
  weapons_primary: { types: ['FPS_Weapon'], subTypes: ['Assault Rifle', 'SMG', 'Shotgun', 'Sniper Rifle', 'LMG'] },
  utility_all: {
    types: ['Tool', 'Gadget', 'Consumable'],
    excludeSubTypes: [
      'Food',
      'Drink',
      'OxygenCap',
      'Assault Rifle',
      'SMG',
      'Shotgun',
      'Sniper Rifle',
      'LMG',
      'Pistol',
      'Launcher',
      'Melee',
      'Throwable',
      'Mine',
    ],
  },
  ammo_all: { types: ['Magazine'] },
  sustenance_all: { types: ['Consumable'], subTypes: ['Food', 'Drink', 'OxygenCap'] },
  other_all: { types: ['Gadget'], excludeSubTypes: ['Handheld', 'Two-handed', 'Device'] },
  fps_all: { types: FPS_ALL_TYPES, excludeSubTypes: ['Food', 'Drink'] },
};

export const ITEM_CATEGORY_FILTERS: Record<string, { types: string[]; subTypes?: string[]; excludeSubTypes?: string[] }> = {
  armor: TAXONOMY_GROUPS.armor_all,
  'armor-suits': { types: ['Armor'] },
  'armor-undersuits': { types: ['Undersuit'] },
  'armor-helmets': { types: ['Armor_Helmet'] },
  'armor-core': { types: ['Armor_Torso'] },
  'armor-arms': { types: ['Armor_Arms'] },
  'armor-legs': { types: ['Armor_Legs'] },
  'armor-backpacks': { types: ['Armor_Backpack'] },
  'armor-flair': { types: ['Attachment'], subTypes: ['Appearance'] },
  clothing: TAXONOMY_GROUPS.clothing_all,
  weapons: TAXONOMY_GROUPS.weapons_all,
  'weapons-sidearms': { types: ['FPS_Weapon'], subTypes: ['Pistol'] },
  'weapons-primary': TAXONOMY_GROUPS.weapons_primary,
  'weapons-primary-ar': { types: ['FPS_Weapon'], subTypes: ['Assault Rifle'] },
  'weapons-primary-smg': { types: ['FPS_Weapon'], subTypes: ['SMG'] },
  'weapons-primary-shotgun': { types: ['FPS_Weapon'], subTypes: ['Shotgun'] },
  'weapons-primary-sniper': { types: ['FPS_Weapon'], subTypes: ['Sniper Rifle'] },
  'weapons-primary-lmg': { types: ['FPS_Weapon'], subTypes: ['LMG'] },
  'weapons-special': { types: ['FPS_Weapon'], subTypes: ['Launcher'] },
  'weapons-melee': { types: ['FPS_Weapon'], subTypes: ['Melee'] },
  'weapons-attachments': { types: ['Attachment'], subTypes: ['Weapon Modifier'] },
  'weapons-throwables': { types: ['FPS_Weapon'], subTypes: ['Throwable', 'Mine'] },
  utility: TAXONOMY_GROUPS.utility_all,
  'utility-gadgets': { types: ['Gadget'], subTypes: ['Handheld', 'Two-handed', 'Device'] },
  'utility-medical': { types: ['Consumable', 'Tool'], subTypes: ['Medical', 'MedPack', 'Stim'] },
  'utility-cryptokeys': { types: ['Consumable'], subTypes: ['Hacking', 'SystemAccess'] },
  'utility-technology': { types: ['Tool', 'Gadget'], subTypes: ['Multitool', 'Module'] },
  ammo: TAXONOMY_GROUPS.ammo_all,
  sustenance: TAXONOMY_GROUPS.sustenance_all,
  'sustenance-food': { types: ['Consumable'], subTypes: ['Food'] },
  'sustenance-drink': { types: ['Consumable'], subTypes: ['Drink'] },
  'sustenance-oxygen': { types: ['Consumable'], subTypes: ['OxygenCap'] },
  other: TAXONOMY_GROUPS.other_all,
};

export const ARMOR_WEIGHT = [
  { label: 'Light', value: 'Light' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Heavy', value: 'Heavy' },
];

export const FPS_SUBTYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  armor: ARMOR_WEIGHT,
  'armor-helmets': ARMOR_WEIGHT,
  'armor-core': ARMOR_WEIGHT,
  'armor-arms': ARMOR_WEIGHT,
  'armor-legs': ARMOR_WEIGHT,
  'armor-backpacks': ARMOR_WEIGHT,
  weapons: ['Pistol', 'SMG', 'Shotgun', 'Sniper Rifle', 'Assault Rifle', 'LMG', 'Launcher', 'Melee'].map((s) => ({ label: s, value: s })),
  'weapons-sidearms': [],
  'weapons-primary': ['Assault Rifle', 'SMG', 'Shotgun', 'Sniper Rifle', 'LMG'].map((s) => ({ label: s, value: s })),
  'weapons-throwables': [
    { label: 'Grenades', value: 'Throwable' },
    { label: 'Mines', value: 'Mine' },
  ],
};
