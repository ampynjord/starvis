export type SupportedLanguage = 'fr' | 'en';

export const TRANSLATIONS = {
  fr: {
    // Navigation & Cockpit
    nav_nexus: 'Nexus Universel',
    nav_starmap: 'Starmap 3D',
    nav_developer: 'API & Jeux de Données',
    nav_changelog: 'Changelog',
    search_placeholder: "Rechercher dans tout l'univers...",
    search_shortcut: 'Ctrl+K',
    my_profile: 'Mon Profil',
    sign_out: 'Déconnexion',
    sign_in: 'CONNEXION',
    open_menu: 'Ouvrir menu',
    close_menu: 'Fermer menu',
    env_live: 'LIVE',
    env_ptu: 'PTU',

    // Hero HUD
    hero_badge: 'UNIVERS CONNECTÉ STAR CITIZEN 4.10.2',
    hero_title: 'STARVIS — NEXUS UNIVERSEL',
    hero_desc:
      "Fin des silos cloisonnés : naviguez d'un vaisseau vers ses armes, les stations qui le vendent, les prix aUEC et la Starmap en temps réel, sans aucune coupure de contexte.",

    // Categories
    cat_all: "Tout l'Univers",
    cat_ships: 'Flotte & Véhicules',
    cat_components: 'Composants & Armes',
    cat_items: 'Équipement FPS',
    cat_locations: 'Lieux & Stations',
    cat_commodities: 'Marché & Commerce',

    // Explorer Bar & States
    filter_placeholder: 'Filtrer par nom humain (ex: Gladius, Panther, MicroTech)...',
    entities_indexed: '{count} entité(s) répertoriée(s)',
    inspect: 'Inspecter →',
    in_game: 'En jeu',
    loading_explorer: 'Chargement des données du Nexus...',
    no_results: 'Aucune entité trouvée pour cette recherche.',
    page_of: 'Page {page} sur {pages}',
    grid_view: 'Grille',
    table_view: 'Tableau',

    // Status Badges
    flight_ready: 'En vol',
    in_concept: 'Concept',
    lore_vessel: 'Vaisseau du Lore',

    // 360° Nexus Sheet
    nexus_360_title: 'Nexus 360° • {category}',
    back: 'Retour',
    loading_sheet: 'Chargement de la fiche Nexus...',
    btn_3d_viewer: 'Visionneuse 3D Holoviewer',
    btn_close_3d: 'Fermer Holoviewer 3D',
    btn_official_rsi: 'Fiche RSI Officielle',
    telemetry_title: 'Télémétrie & Spécifications Physiques',
    dimensions: 'Dimensions',
    mass: 'Masse',
    speed: 'Vitesse SCM / Max',
    cargo: 'Capacité Cargo',
    crew: 'Équipage',
    hull_hp: 'Points de Coque',
    shield_hp: 'Boucliers',
    quantum_fuel: 'Carburant QT',
    loadout_title: "Points d'Emport & Composants Équipés",
    loadout_subtitle: 'Composants par défaut installés en usine',
    shops_title: 'Disponibilité & Boutiques en Jeu (aUEC)',
    shops_subtitle: 'Où acheter ou louer cette entité dans le Verse',
    compatible_ships_title: 'Vaisseaux Équipant ce Composant',
    compatible_ships_subtitle: 'Vaisseaux intégrant ce composant dans leur équipement',
    shop_inventory_title: 'Inventaire de la Boutique',
    shop_inventory_subtitle: 'Articles et composants disponibles à cette adresse',
    where_buy_commodity: "Points d'Achat & Vente de Marchandise",
    where_buy_commodity_subtitle: 'Terminaux et cours d’échange commerciaux aUEC',
    buy_price: 'Prix Achat :',
    sell_price: 'Prix Vente :',
    rent_from: 'Location dès',
    pivot_to: 'Inspecter fiche 360°',

    // OmniSearch Modal
    omni_title: "Recherche Universelle d'Entités",
    omni_placeholder: 'Rechercher un vaisseau, composant, lieu, marchandise... (ex: Gladius, Cutlass, Pyro)',
    omni_quick_tags: 'Filtres rapides :',
    omni_no_results: 'Aucun résultat trouvé pour "{query}"',
    omni_empty_hint: 'Saisissez au moins 2 lettres pour sonder l’Univers',
    key_navigate: 'pour naviguer',
    key_open: 'pour inspecter',
    key_close: 'pour fermer',

    // Sidebar & Deep pages
    menu_dashboard: 'Tableau de bord',
    menu_platform: 'Plateforme',
    menu_ships: 'Flotte & Véhicules',
    menu_components: 'Composants de Véhicule',
    menu_manufacturers: 'Constructeurs',
    menu_items: 'Équipement FPS',
    menu_weapons: 'Armes FPS',
    menu_armor: 'Armures',
    menu_loot: 'Tables de Butin',
    menu_economy: 'Économie & Industrie',
    menu_commodities: 'Marchandises',
    menu_missions: 'Missions',
    menu_factions: 'Factions',
    menu_universe: 'Univers',
    menu_starmap: 'Starmap 3D',
    menu_galactapedia: 'Galactapedia',
    menu_commlinks: 'Comm-Links',
    menu_admin: 'Administration',
    menu_users: 'Utilisateurs',
    menu_bugs: 'Signalements de Bug',
    menu_monitoring: 'Supervision API',
    menu_about: 'À propos',
    menu_legal: 'Mentions Légales',
  },
  en: {
    // Navigation & Cockpit
    nav_nexus: 'Universal Nexus',
    nav_starmap: '3D Starmap',
    nav_developer: 'API & Datasets',
    nav_changelog: 'Changelog',
    search_placeholder: 'Search the entire universe...',
    search_shortcut: 'Ctrl+K',
    my_profile: 'My Profile',
    sign_out: 'Sign Out',
    sign_in: 'SIGN IN',
    open_menu: 'Open menu',
    close_menu: 'Close menu',
    env_live: 'LIVE',
    env_ptu: 'PTU',

    // Hero HUD
    hero_badge: 'STAR CITIZEN 4.10.2 CONNECTED UNIVERSE',
    hero_title: 'STARVIS — UNIVERSAL NEXUS',
    hero_desc:
      'No more isolated silos: navigate from a ship to its weapons, selling stations, real-time aUEC prices, and 3D Starmap without losing context.',

    // Categories
    cat_all: 'Entire Universe',
    cat_ships: 'Fleet & Vehicles',
    cat_components: 'Components & Weapons',
    cat_items: 'FPS Equipment',
    cat_locations: 'Locations & Stations',
    cat_commodities: 'Market & Commodities',

    // Explorer Bar & States
    filter_placeholder: 'Filter by human in-game name (e.g. Gladius, Panther, MicroTech)...',
    entities_indexed: '{count} entity(ies) indexed',
    inspect: 'Inspect →',
    in_game: 'In Game',
    loading_explorer: 'Scanning Nexus frequencies...',
    no_results: 'No entities found for this query.',
    page_of: 'Page {page} of {pages}',
    grid_view: 'Grid',
    table_view: 'Table',

    // Status Badges
    flight_ready: 'Flight-Ready',
    in_concept: 'Concept',
    lore_vessel: 'Lore Vessel',

    // 360° Nexus Sheet
    nexus_360_title: 'Nexus 360° • {category}',
    back: 'Back',
    loading_sheet: 'Loading Nexus sheet...',
    btn_3d_viewer: '3D Holoviewer',
    btn_close_3d: 'Close 3D Holoviewer',
    btn_official_rsi: 'Official RSI Page',
    telemetry_title: 'Telemetry & Physical Specifications',
    dimensions: 'Dimensions',
    mass: 'Mass',
    speed: 'SCM / Max Speed',
    cargo: 'Cargo Capacity',
    crew: 'Crew',
    hull_hp: 'Hull HP',
    shield_hp: 'Shields HP',
    quantum_fuel: 'Quantum Fuel',
    loadout_title: 'Equipped Loadout & Hardpoints',
    loadout_subtitle: 'Factory-installed default ship components',
    shops_title: 'In-Game Shop Availability (aUEC)',
    shops_subtitle: 'Where to buy or rent this entity across the Verse',
    compatible_ships_title: 'Ships Equipping this Component',
    compatible_ships_subtitle: 'Vehicles that feature this item in their standard loadout',
    shop_inventory_title: 'Shop Inventory',
    shop_inventory_subtitle: 'Items and components available at this terminal',
    where_buy_commodity: 'Commodity Buy & Sell Locations',
    where_buy_commodity_subtitle: 'Trading terminals and real-time aUEC commodity rates',
    buy_price: 'Buy Price:',
    sell_price: 'Sell Price:',
    rent_from: 'Rent from',
    pivot_to: 'Inspect 360° sheet',

    // OmniSearch Modal
    omni_title: 'Universal Entity Search',
    omni_placeholder: 'Search for a ship, component, location, commodity... (e.g. Gladius, Cutlass, Pyro)',
    omni_quick_tags: 'Quick filters:',
    omni_no_results: 'No results found for "{query}"',
    omni_empty_hint: 'Type at least 2 characters to probe the Universe',
    key_navigate: 'to navigate',
    key_open: 'to inspect',
    key_close: 'to close',

    // Sidebar & Deep pages
    menu_dashboard: 'Dashboard',
    menu_platform: 'Platform',
    menu_ships: 'Ships & Vehicles',
    menu_components: 'Vehicle Components',
    menu_manufacturers: 'Manufacturers',
    menu_items: 'FPS Equipment',
    menu_weapons: 'Weapons',
    menu_armor: 'Armor',
    menu_loot: 'Loot Tables',
    menu_economy: 'Economy & Industry',
    menu_commodities: 'Commodities',
    menu_missions: 'Missions',
    menu_factions: 'Factions',
    menu_universe: 'Universe',
    menu_starmap: '3D Starmap',
    menu_galactapedia: 'Galactapedia',
    menu_commlinks: 'Comm-Links',
    menu_admin: 'Administration',
    menu_users: 'Users',
    menu_bugs: 'Bug Reports',
    menu_monitoring: 'Monitoring',
    menu_about: 'About',
    menu_legal: 'Legal Terms',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.fr;

export function getTranslation(lang: SupportedLanguage, key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
  let text: string = (dict as any)[key] || TRANSLATIONS.fr[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
