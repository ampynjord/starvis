-- Lore Ships & Kruger Stingray Seed
BEGIN;

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9001, 'Bengal', 'RSI', 'Roberts Space Industries', 'Fleet Carrier / Strike Carrier', 'capital',
  'The Bengal is a fleet carrier spacecraft developed in SEY 2871 by Roberts Space Industries for the United Empire of Earth Navy. Bengal-class carriers carry a full complement of fighters, bombers and support ships and typically form the nucleus of a Navy battle fleet or task force group. Measuring roughly 1,000 meters in length, it is one of the most powerful symbols of UEE naval might.', 'lore', 'capital', 990, 260, 140,
  25, 750, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6', 'https://robertsspaceindustries.com/galactapedia/article/RwZBLqLQdp-bengal', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9002, 'Pegasus', 'RSI', 'Roberts Space Industries', 'Escort Carrier', 'capital',
  'The Pegasus is an escort-class carrier spacecraft and capital ship manufactured by Roberts Space Industries for the United Empire of Earth military. Capable of supporting the operations of over 30 combat fighters, it is an essential component of UEE Navy strike groups, balancing carrier capacity with strategic fleet mobility.', 'lore', 'capital', 700, 210, 90,
  16, 250, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6', 'https://robertsspaceindustries.com/galactapedia/article/bBp64jrA7d-pegasus', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9003, 'Retribution', 'UEE', 'United Empire of Earth Navy', 'Super Dreadnought / Flagship', 'capital',
  'Retribution is a colossal dreadnought spacecraft manufactured by the United Empire of Earth military in cooperation with multiple major aerospace manufacturers. Codenamed Project Ouadeen during secret development, it was specifically engineered to counter Vanduul Kingships. Spanning nearly 3,000 meters, the Retribution is the largest military spacecraft ever constructed by Humanity.', 'lore', 'capital', 2700, 550, 380,
  150, 3000, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/33ad3d53-9d2b-4148-b8ed-81f54bbdf661', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/33ad3d53-9d2b-4148-b8ed-81f54bbdf661', 'https://robertsspaceindustries.com/galactapedia/article/VDoP9a3lKz-retribution', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9004, 'Vanduul Kingship', 'VNCL', 'Vanduul', 'Dreadnought / Fleet Flagship', 'capital',
  'Kingship is the UEE military designation for apex Vanduul capital ships that serve as the command flagships of large Vanduul Clans. The Kingship is the largest and most destructive class of Vanduul warship encountered, functioning simultaneously as a dreadnought, fleet carrier, planetary siege platform, and mobile clan city.', 'lore', 'capital', 1500, 420, 310,
  50, 1200, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b', 'https://robertsspaceindustries.com/galactapedia/article/V3qWn9Dlvm-vanduul-kingship', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9005, 'Vanduul Driller', 'VNCL', 'Vanduul', 'Heavy Escort & Troop Carrier', 'capital',
  'The Driller is the UEE Navy military designation for a heavily armored escort and troop carrier operated by the Vanduul. Accompanying large clans during system invasions, it carries boarding teams, specialized armor, and heavy offensive weaponry capable of breaking through planetary defenses.', 'lore', 'capital', 400, 180, 95,
  12, 180, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/4f83dad0-51e3-4caa-b997-f5833850ecfb', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/4f83dad0-51e3-4caa-b997-f5833850ecfb', 'https://robertsspaceindustries.com/galactapedia/article/V3GPzWDO1A-driller', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9006, 'Vanduul Void', 'VNCL', 'Vanduul', 'Heavy Bomber', 'combat',
  'The Void is the official UEE Navy designation for the standard heavy bomber deployed by Vanduul assault fleets. Designed to breach capital ship hulls and deliver catastrophic payloads against naval stations and defensive orbital emplacements.', 'lore', 'medium', 45, 38, 12,
  1, 3, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/470ba15b-2048-48eb-b519-86548b8254a3', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/470ba15b-2048-48eb-b519-86548b8254a3', 'https://robertsspaceindustries.com/galactapedia/article/RWozkp8l82-void', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9007, 'Vanduul Harvester', 'VNCL', 'Vanduul', 'Planetary Stripping & Mining', 'industrial',
  'The Vanduul Harvester is an industrial platform observed deploying planet-side machinery to consume natural resources and mineral veins directly from planetary crusts during clan expansion raids.', 'lore', 'large', 260, 110, 80,
  8, 80, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b', 'https://robertsspaceindustries.com/galactapedia/article/0n1MYzOkG7-harvester', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9008, 'Zeus (Historical 2140)', 'RSI', 'Roberts Space Industries', 'Historical Quantum Explorer', 'exploration',
  'The Zeus was a pioneering spacecraft developed in 2140 by Roberts Space Industries, representing the first commercial ship equipped with a quantum drive accessible to civilians. Its release revolutionized Human space exploration and catalyzed the colonization of the solar system and neighboring star systems.', 'lore', 'medium', 42, 24, 10,
  1, 3, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/fc45323f-6d37-4112-a418-28b525a202f4', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/fc45323f-6d37-4112-a418-28b525a202f4', 'https://robertsspaceindustries.com/galactapedia/article/VYLd4WxODo-zeus', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9009, 'F8A Lightning (Military)', 'ANVL', 'Anvil Aerospace', 'Space Superiority Fighter', 'combat',
  'The F8A Lightning is the elite, military-spec space superiority heavy fighter deployed exclusively by the United Empire of Earth Navy (featured in Squadron 42). Featuring heavier armor, unrestricted military hardpoints, and triple high-output thrusters, it represents the pinnacle of UEE dogfighting technology.', 'lore', 'small', 26, 22, 7.5,
  1, 1, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580', 'https://robertsspaceindustries.com/galactapedia/article/bZwQ7r6nkE-f8a-lightning', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO rsi.ship_matrix (
  id, name, manufacturer_code, manufacturer_name, focus, type,
  description, production_status, size, length, beam, height,
  min_crew, max_crew, media_store_small, media_store_large, url, synced_at
) VALUES (
  9010, 'F7A Hornet (Military)', 'ANVL', 'Anvil Aerospace', 'Military Carrier Fighter', 'combat',
  'The F7A Hornet is the iconic frontline carrier-based medium fighter of the UEE Navy. Featured prominently throughout Squadron 42 and naval defense operations, the military F7A differs from civilian F7C models with reinforced plating, military-grade thrusters, and specialized naval weaponry.', 'lore', 'small', 22.5, 21.5, 6.8,
  1, 1, 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580', 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580', 'https://robertsspaceindustries.com/galactapedia/article/RXlXgwDlDk-F7A-Hornet', NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  manufacturer_name = EXCLUDED.manufacturer_name,
  focus = EXCLUDED.focus,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  production_status = EXCLUDED.production_status,
  size = EXCLUDED.size,
  length = EXCLUDED.length,
  beam = EXCLUDED.beam,
  height = EXCLUDED.height,
  min_crew = EXCLUDED.min_crew,
  max_crew = EXCLUDED.max_crew,
  media_store_small = EXCLUDED.media_store_small,
  media_store_large = EXCLUDED.media_store_large,
  url = EXCLUDED.url,
  synced_at = NOW();

INSERT INTO game.manufacturers (code, name, known_for)
VALUES ('KRIG', 'Kruger Intergalactic', 'Snub & Medium Fighters')
ON CONFLICT (code) DO NOTHING;

INSERT INTO game.manufacturers (code, name, known_for)
VALUES ('UEE', 'United Empire of Earth Navy', 'Naval Defense Command')
ON CONFLICT (code) DO NOTHING;

INSERT INTO game.ships (
  env, uuid, class_name, name, manufacturer_code,
  role, career, crew_size,
  size_x, size_y, size_z,
  mass, scm_speed, max_speed,
  total_hp, cargo_capacity, vehicle_category, ship_matrix_id, extracted_at
) VALUES (
  'live', 'afd2442f-79d0-88f2-d364-235570d4e983', 'KRIG_S65_Stingray', 'S-65 Stingray', 'KRIG',
  'Medium Fighter', 'Combat', 1,
  20.45, 15.10, 8.23,
  32000, 240, 1250,
  2500, 0, 'ship', 322, NOW()
) ON CONFLICT (uuid, env) DO UPDATE SET
  class_name = EXCLUDED.class_name,
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  role = EXCLUDED.role,
  career = EXCLUDED.career,
  crew_size = EXCLUDED.crew_size,
  size_x = EXCLUDED.size_x,
  size_y = EXCLUDED.size_y,
  size_z = EXCLUDED.size_z,
  mass = EXCLUDED.mass,
  scm_speed = EXCLUDED.scm_speed,
  max_speed = EXCLUDED.max_speed,
  total_hp = EXCLUDED.total_hp,
  cargo_capacity = EXCLUDED.cargo_capacity,
  vehicle_category = EXCLUDED.vehicle_category,
  ship_matrix_id = 322,
  variant_type = NULL,
  extracted_at = NOW();

INSERT INTO game.ships (
  env, uuid, class_name, name, manufacturer_code,
  role, career, crew_size,
  size_x, size_y, size_z,
  mass, scm_speed, max_speed,
  total_hp, cargo_capacity, vehicle_category, ship_matrix_id, extracted_at
) VALUES (
  'live', 'd05c48c4-c4f1-0932-5595-630b4178cb9c', 'KRIG_S65_Stingray_BALLISTIC', 'S-65 Stingray Ballistic', 'KRIG',
  'Medium Fighter', 'Combat', 1,
  20.45, 15.10, 8.23,
  32500, 235, 1240,
  2500, 0, 'ship', 322, NOW()
) ON CONFLICT (uuid, env) DO UPDATE SET
  class_name = EXCLUDED.class_name,
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  role = EXCLUDED.role,
  career = EXCLUDED.career,
  crew_size = EXCLUDED.crew_size,
  size_x = EXCLUDED.size_x,
  size_y = EXCLUDED.size_y,
  size_z = EXCLUDED.size_z,
  mass = EXCLUDED.mass,
  scm_speed = EXCLUDED.scm_speed,
  max_speed = EXCLUDED.max_speed,
  total_hp = EXCLUDED.total_hp,
  cargo_capacity = EXCLUDED.cargo_capacity,
  vehicle_category = EXCLUDED.vehicle_category,
  ship_matrix_id = 322,
  variant_type = NULL,
  extracted_at = NOW();

INSERT INTO game.ships (
  env, uuid, class_name, name, manufacturer_code,
  role, career, crew_size,
  size_x, size_y, size_z,
  mass, scm_speed, max_speed,
  total_hp, cargo_capacity, vehicle_category, ship_matrix_id, extracted_at
) VALUES (
  'live', '78d94d5b-7261-1e83-dda3-d612d3907cb1', 'ANVL_Lightning_F8', 'F8A Lightning', 'ANVL',
  'Space Superiority Fighter', 'Combat', 1,
  22.00, 26.00, 7.50,
  36000, 230, 1240,
  4200, 0, 'ship', 9009, NOW()
) ON CONFLICT (uuid, env) DO UPDATE SET
  class_name = EXCLUDED.class_name,
  name = EXCLUDED.name,
  manufacturer_code = EXCLUDED.manufacturer_code,
  role = EXCLUDED.role,
  career = EXCLUDED.career,
  crew_size = EXCLUDED.crew_size,
  size_x = EXCLUDED.size_x,
  size_y = EXCLUDED.size_y,
  size_z = EXCLUDED.size_z,
  mass = EXCLUDED.mass,
  scm_speed = EXCLUDED.scm_speed,
  max_speed = EXCLUDED.max_speed,
  total_hp = EXCLUDED.total_hp,
  cargo_capacity = EXCLUDED.cargo_capacity,
  vehicle_category = EXCLUDED.vehicle_category,
  ship_matrix_id = 9009,
  variant_type = 'military',
  extracted_at = NOW();

UPDATE meta.extraction_log
SET ships_count = (SELECT COUNT(*) FROM game.ships WHERE env = 'live')
WHERE id = (SELECT id FROM meta.extraction_log ORDER BY extracted_at DESC LIMIT 1);

COMMIT;
