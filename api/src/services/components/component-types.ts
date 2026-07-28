/**
 * Un composant tel que l'API le sert.
 *
 * Les requêtes font `SELECT c.*` : la forme suit les colonnes de la table, plus
 * ce que les expressions calculées et les jointures ajoutent. Les champs sont
 * dérivés du modèle Prisma, pas transcrits — 124 colonnes ne se recopient pas
 * sans faute.
 *
 * **Les colonnes `Decimal` sortent en chaîne**, comme partout ailleurs dans
 * cette API : c'est ce que rend le pilote pour un `numeric`. Les `Int` sortent
 * en nombre.
 *
 * `normalized_name` et `canonical_component_key` sont absents : `stripInternal`
 * les retire, ils ne font pas partie du contrat.
 *
 * **`raw_json` pèse 90 % de la réponse** — 1,46 Mo sur 1,6 Mo pour cinquante
 * composants. Il est déclaré une fois côté IHM et jamais lu. Le retirer romprait
 * le contrat vis-à-vis des tiers ; la décision n'appartient pas au typage, mais
 * elle est mesurée ici pour être prise en connaissance de cause.
 */
export interface PublicComponent {
  uuid: string;
  env: string;
  class_name: string;
  name: string;
  type: string;
  game_component_category: string;
  sub_type: string | null;
  size: number | null;
  grade: string | null;
  component_class: string | null;
  is_bespoke: boolean;
  manufacturer_code: string | null;
  mass: string | null /** `Decimal` : chaîne. */;
  hp: number | null;
  power_draw: string | null /** `Decimal` : chaîne. */;
  power_base: string | null /** `Decimal` : chaîne. */;
  power_output: string | null /** `Decimal` : chaîne. */;
  heat_generation: string | null /** `Decimal` : chaîne. */;
  cooling_rate: string | null /** `Decimal` : chaîne. */;
  em_signature: string | null /** `Decimal` : chaîne. */;
  ir_signature: string | null /** `Decimal` : chaîne. */;
  weapon_damage: string | null /** `Decimal` : chaîne. */;
  weapon_damage_type: string | null;
  weapon_fire_rate: string | null /** `Decimal` : chaîne. */;
  weapon_range: string | null /** `Decimal` : chaîne. */;
  weapon_speed: string | null /** `Decimal` : chaîne. */;
  weapon_ammo_count: number | null;
  weapon_pellets_per_shot: number | null;
  weapon_burst_size: number | null;
  weapon_alpha_damage: string | null /** `Decimal` : chaîne. */;
  weapon_dps: string | null /** `Decimal` : chaîne. */;
  weapon_damage_physical: string | null /** `Decimal` : chaîne. */;
  weapon_damage_energy: string | null /** `Decimal` : chaîne. */;
  weapon_damage_distortion: string | null /** `Decimal` : chaîne. */;
  weapon_damage_thermal: string | null /** `Decimal` : chaîne. */;
  weapon_damage_biochemical: string | null /** `Decimal` : chaîne. */;
  weapon_damage_stun: string | null /** `Decimal` : chaîne. */;
  weapon_burst_dps: string | null /** `Decimal` : chaîne. */;
  weapon_sustained_dps: string | null /** `Decimal` : chaîne. */;
  weapon_full_damage_range: string | null /** `Decimal` : chaîne. */;
  weapon_zero_damage_range: string | null /** `Decimal` : chaîne. */;
  weapon_heat_per_second: string | null /** `Decimal` : chaîne. */;
  weapon_beam_capacity: string | null /** `Decimal` : chaîne. */;
  weapon_beam_regen_cooldown: string | null /** `Decimal` : chaîne. */;
  weapon_beam_dps: string | null /** `Decimal` : chaîne. */;
  shield_hp: string | null /** `Decimal` : chaîne. */;
  shield_regen: string | null /** `Decimal` : chaîne. */;
  shield_regen_delay: string | null /** `Decimal` : chaîne. */;
  shield_hardening: string | null /** `Decimal` : chaîne. */;
  shield_faces: number | null;
  qd_speed: string | null /** `Decimal` : chaîne. */;
  qd_spool_time: string | null /** `Decimal` : chaîne. */;
  qd_cooldown: string | null /** `Decimal` : chaîne. */;
  qd_fuel_rate: string | null /** `Decimal` : chaîne. */;
  qd_range: string | null /** `Decimal` : chaîne. */;
  qd_stage1_accel: string | null /** `Decimal` : chaîne. */;
  qd_stage2_accel: string | null /** `Decimal` : chaîne. */;
  qd_tuning_rate: string | null /** `Decimal` : chaîne. */;
  qd_alignment_rate: string | null /** `Decimal` : chaîne. */;
  qd_disconnect_range: string | null /** `Decimal` : chaîne. */;
  missile_damage: string | null /** `Decimal` : chaîne. */;
  missile_signal_type: string | null;
  missile_lock_time: string | null /** `Decimal` : chaîne. */;
  missile_speed: string | null /** `Decimal` : chaîne. */;
  missile_range: string | null /** `Decimal` : chaîne. */;
  missile_lock_range: string | null /** `Decimal` : chaîne. */;
  missile_damage_physical: string | null /** `Decimal` : chaîne. */;
  missile_damage_energy: string | null /** `Decimal` : chaîne. */;
  missile_damage_distortion: string | null /** `Decimal` : chaîne. */;
  missile_damage_thermal: string | null /** `Decimal` : chaîne. */;
  missile_damage_biochemical: string | null /** `Decimal` : chaîne. */;
  missile_damage_stun: string | null /** `Decimal` : chaîne. */;
  thruster_max_thrust: string | null /** `Decimal` : chaîne. */;
  thruster_type: string | null;
  radar_range: string | null /** `Decimal` : chaîne. */;
  radar_detection_lifetime: string | null /** `Decimal` : chaîne. */;
  radar_tracking_signal: string | null /** `Decimal` : chaîne. */;
  cm_ammo_count: number | null;
  fuel_capacity: string | null /** `Decimal` : chaîne. */;
  fuel_intake_rate: string | null /** `Decimal` : chaîne. */;
  emp_damage: string | null /** `Decimal` : chaîne. */;
  emp_radius: string | null /** `Decimal` : chaîne. */;
  emp_charge_time: string | null /** `Decimal` : chaîne. */;
  emp_cooldown: string | null /** `Decimal` : chaîne. */;
  qig_jammer_range: string | null /** `Decimal` : chaîne. */;
  qig_snare_radius: string | null /** `Decimal` : chaîne. */;
  qig_charge_time: string | null /** `Decimal` : chaîne. */;
  qig_cooldown: string | null /** `Decimal` : chaîne. */;
  mining_speed: string | null /** `Decimal` : chaîne. */;
  mining_range: string | null /** `Decimal` : chaîne. */;
  mining_resistance: string | null /** `Decimal` : chaîne. */;
  mining_instability: string | null /** `Decimal` : chaîne. */;
  tractor_max_force: string | null /** `Decimal` : chaîne. */;
  tractor_max_range: string | null /** `Decimal` : chaîne. */;
  salvage_speed: string | null /** `Decimal` : chaîne. */;
  salvage_radius: string | null /** `Decimal` : chaîne. */;
  salvage_range: string | null /** `Decimal` : chaîne. */;
  gimbal_type: string | null;
  gimbal_max_angle: string | null /** `Decimal` : chaîne. */;
  gimbal_pitch_speed: string | null /** `Decimal` : chaîne. */;
  gimbal_yaw_speed: string | null /** `Decimal` : chaîne. */;
  turret_min_pitch: string | null /** `Decimal` : chaîne. */;
  turret_max_pitch: string | null /** `Decimal` : chaîne. */;
  turret_min_yaw: string | null /** `Decimal` : chaîne. */;
  turret_max_yaw: string | null /** `Decimal` : chaîne. */;
  rack_count: number | null;
  rack_missile_size: number | null;
  radar_ping_range: string | null /** `Decimal` : chaîne. */;
  radar_ping_cooldown: string | null /** `Decimal` : chaîne. */;
  shield_downed_regen_delay: string | null /** `Decimal` : chaîne. */;
  weapon_heat_per_shot: string | null /** `Decimal` : chaîne. */;
  weapon_charge_time: string | null /** `Decimal` : chaîne. */;
  cm_type: string | null;
  missile_explosion_radius: string | null /** `Decimal` : chaîne. */;
  missile_guidance_mode: string | null;
  qd_calibration_rate: string | null /** `Decimal` : chaîne. */;
  qd_calibration_delay: string | null /** `Decimal` : chaîne. */;
  qd_calibration_max_angle: string | null /** `Decimal` : chaîne. */;
  p4k_path: string | null;
  raw_json: unknown | null;
  created_at: Date;
  updated_at: Date;
  // Ajoutés par les jointures et les expressions calculées
  /** Ajouté par la jointure sur les constructeurs. */
  manufacturer_name: string | null;
  /** `Decimal` : chaîne. */
  min_purchase_price: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_1d: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_3d: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_7d: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_30d: string | null;
  purchase_location_count: number;
  rental_location_count: number;
  /** Forme standard de l'identifiant, ajoutée par `stripInternal`. */
  sc_uuid?: string;
}
