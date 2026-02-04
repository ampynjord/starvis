/**
 * RSI Ship Matrix → P4K DataForge Name Aliases
 * 
 * Le Ship Matrix RSI utilise des noms différents de ceux dans le P4K (DataForge).
 * Ce fichier contient les mappings pour faire correspondre les noms RSI aux vrais
 * noms P4K afin de récupérer les bons UUIDs et données des vaisseaux.
 * 
 * Format: "RSI_NAME": "P4K_DATAFORGE_NAME"
 */

export const RSI_TO_P4K_ALIASES: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CRUSADER INDUSTRIES
  // ═══════════════════════════════════════════════════════════════════════════
  // Hercules → Starlifter
  "CRUS_A2_Hercules": "CRUS_Starlifter_A2",
  "CRUS_C2_Hercules": "CRUS_Starlifter_C2",
  "CRUS_M2_Hercules": "CRUS_Starlifter_M2",
  // Ares → Starfighter
  "CRUS_Ares_Ion": "CRUS_Starfighter_Ion",
  "CRUS_Ares_Inferno": "CRUS_Starfighter_Inferno",
  // Mercury → Star_Runner
  "CRUS_Mercury": "CRUS_Star_Runner",

  // ═══════════════════════════════════════════════════════════════════════════
  // AOPOA / XI'AN (manufacturer_code: XNAA dans RSI)
  // ═══════════════════════════════════════════════════════════════════════════
  // San'tok.yāi variants
  "AOPOA_Santokyai": "XNAA_SanTokYai",
  "AOPOA_San_tok_yai": "XNAA_SanTokYai",
  "AOPOA_Santokai": "XNAA_SanTokYai",
  "XIAN_Santokyai": "XNAA_SanTokYai",
  "XNAA_San_tok_yai": "XNAA_SanTokYai",
  "XNAA_Santokyai": "XNAA_SanTokYai",
  
  // Khartu-Al → XIAN_Scout (nom interne P4K)
  "AOPOA_Khartu_Al": "XIAN_Scout",
  "AOPOA_KhartuAl": "XIAN_Scout",
  "AOPOA_Khartu-Al": "XIAN_Scout",
  "XNAA_Khartu_Al": "XIAN_Scout",
  "XNAA_KhartuAl": "XIAN_Scout",
  "XNAA_Khartu-Al": "XIAN_Scout",

  // ═══════════════════════════════════════════════════════════════════════════
  // KRUGER INTERGALACTIC
  // ═══════════════════════════════════════════════════════════════════════════
  // P-72 Archimedes - le tiret est parfois converti en underscore
  "KRIG_P_72_Archimedes": "KRIG_P72_Archimedes",
  "KRIG_P_72_Archimedes_Emerald": "KRIG_P72_Archimedes_Emerald",

  // ═══════════════════════════════════════════════════════════════════════════
  // ANVIL AEROSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  // F8C Lightning
  "ANVL_F8C_Lightning": "ANVL_Lightning_F8C",
  "ANVL_F8C_Lightning_Executive_Edition": "ANVL_Lightning_F8C_Exec",
  // Ballista variants - RSI préfixe avec "Anvil"
  "ANVL_Anvil_Ballista_Dunestalker": "ANVL_Ballista_Dunestalker",
  "ANVL_Anvil_Ballista_Snowblind": "ANVL_Ballista_Snowblind",

  // ═══════════════════════════════════════════════════════════════════════════
  // AEGIS DYNAMICS
  // ═══════════════════════════════════════════════════════════════════════════
  // Idris - un seul vaisseau dans P4K pour les deux variantes
  "AEGS_Idris_M": "AEGS_Idris",
  "AEGS_Idris_P": "AEGS_Idris",
  "AEGS_Idris-M": "AEGS_Idris",
  "AEGS_Idris-P": "AEGS_Idris",

  // ═══════════════════════════════════════════════════════════════════════════
  // ARGO ASTRONAUTICS
  // ═══════════════════════════════════════════════════════════════════════════
  "ARGO_CSV_SM": "ARGO_CSV_Cargo",
  "ARGO_MPUV_Cargo": "ARGO_MPUV",
  "ARGO_MPUV_Personnel": "ARGO_MPUV_Transport",
  "ARGO_MPUV_Tractor": "ARGO_MPUV_1T",

  // ═══════════════════════════════════════════════════════════════════════════
  // ROBERTS SPACE INDUSTRIES
  // ═══════════════════════════════════════════════════════════════════════════
  // Ursa Rover variants
  "RSI_Ursa": "RSI_Ursa_Rover",
  "RSI_Ursa_Fortuna": "RSI_Ursa_Rover_Emerald",
  "RSI_Lynx": "RSI_Ursa_Rover",
};

/**
 * Codes fabricants utilisés dans le P4K DataForge
 */
export const MANUFACTURER_CODES: Record<string, string> = {
  AEGS: "Aegis Dynamics",
  ANVL: "Anvil Aerospace",
  AOPOA: "Aopoa",
  ARGO: "Argo Astronautics",
  BANU: "Banu",
  CNOU: "Consolidated Outland",
  CRUS: "Crusader Industries",
  DRAK: "Drake Interplanetary",
  ESPR: "Esperia",
  GAMA: "Gatac Manufacture",
  GRIN: "Greycat Industrial",
  KRIG: "Kruger Intergalactic",
  MIRA: "Mirai",
  MISC: "MISC",
  ORIG: "Origin Jumpworks",
  RSI: "Roberts Space Industries",
  TMBL: "Tumbril",
  VNCL: "Vanduul",
  XIAN: "Aopoa",
  XNAA: "Aopoa", // Code utilisé par RSI pour Aopoa
};
