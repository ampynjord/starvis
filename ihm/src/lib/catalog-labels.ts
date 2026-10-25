import type { SupportedLanguage } from '@/lib/i18n';

const EN_TO_FR: Record<string, string> = {
  Ship: 'Vaisseau',
  Component: 'Composant',
  Equipment: 'Équipement',
  Item: 'Équipement',
  Location: 'Lieu',
  Commodity: 'Marchandise',
  'Light Fighter': 'Chasseur léger',
  'Medium Fighter': 'Chasseur moyen',
  'Heavy Fighter': 'Chasseur lourd',
  'Light Freight': 'Fret léger',
  'Medium Freight': 'Fret moyen',
  'Heavy Freight': 'Fret lourd',
  'Luxury Touring': 'Tourisme de luxe',
  'Heavy Bomber': 'Bombardier lourd',
  Transporter: 'Transport',
  Interceptor: 'Intercepteur',
  Bomber: 'Bombardier',
  Stealth: 'Furtivité',
  Exploration: 'Exploration',
  Expedition: 'Expédition',
  Pathfinder: 'Éclaireur',
  Cargo: 'Fret',
  Transport: 'Transport',
  Mining: 'Minage',
  Medical: 'Médical',
  Passenger: 'Passagers',
  Touring: 'Tourisme',
  Racing: 'Course',
  Competition: 'Compétition',
  Snub: 'Navette',
  Gunship: 'Canonnière',
  Dropship: 'Vaisseau d’assaut',
  Corvette: 'Corvette',
  Frigate: 'Frégate',
  Destroyer: 'Destroyer',
  Capital: 'Vaisseau capital',
  Industrial: 'Industriel',
  Starter: 'Débutant',
  Combat: 'Combat',
  Support: 'Soutien',
  Salvage: 'Récupération',
  Repair: 'Réparation',
  Refueling: 'Ravitaillement',
  Science: 'Science',
  Shield: 'Bouclier',
  Cooler: 'Refroidisseur',
  PowerPlant: 'Générateur',
  QuantumDrive: 'Moteur quantique',
  WeaponGun: 'Arme de vaisseau',
  Missile: 'Missile',
  MissileRack: 'Râtelier de missiles',
  Gadget: 'Gadget',
  Clothing: 'Vêtement',
  Armor_Helmet: 'Casque',
  Helmet: 'Casque',
  Undersuit: 'Combinaison',
  Food: 'Nourriture',
  Consumable: 'Consommable',
  Drink: 'Boisson',
  Handheld: 'Portable',
  Radar: 'Radar',
  Scanner: 'Scanner',
  JumpDrive: 'Module de saut',
  JumpModule: 'Module de saut',
  Emp: 'IEM',
  SpaceStation: 'Station spatiale',
  LandingZone: 'Zone d’atterrissage',
  City: 'Ville',
  Outpost: 'Avant-poste',
  Planet: 'Planète',
  Moon: 'Lune',
  Settlement: 'Colonie',
  LagrangePoint: 'Point de Lagrange',
  landing_zone: 'Zone d’atterrissage',
  station: 'Station spatiale',
  rest_stop: 'Relais spatial',
  planet: 'Planète',
  moon: 'Lune',
  outpost: 'Avant-poste',
  bunker: 'Bunker',
  jump_point: 'Point de saut',
  comm_array: 'Balise de com',
  mining_claim: 'Site minier',
  system: 'Système stellaire',
  star: 'Étoile',
};

const FR_TO_EN: Record<string, string> = Object.fromEntries(Object.entries(EN_TO_FR).map(([english, french]) => [french, english]));

const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  ships: { fr: 'Flotte', en: 'Fleet' },
  components: { fr: 'Composants', en: 'Components' },
  items: { fr: 'Équipement', en: 'Equipment' },
  locations: { fr: 'Lieux', en: 'Locations' },
  commodities: { fr: 'Marché', en: 'Market' },
};

function localizeToken(language: SupportedLanguage, value: string): string {
  const category = CATEGORY_LABELS[value];
  if (category) return category[language];
  if (language === 'fr') return EN_TO_FR[value] ?? value;
  return FR_TO_EN[value] ?? value;
}

export function localizeCatalogLabel(language: SupportedLanguage, value?: string | null): string {
  if (!value) return '';
  const separator = value.includes(' • ') ? ' • ' : value.includes(' / ') ? ' / ' : null;
  if (!separator) return localizeToken(language, value);
  return value
    .split(separator)
    .map((part) => localizeToken(language, part.trim()))
    .join(separator);
}
