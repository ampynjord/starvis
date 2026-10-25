import pg from 'pg';

const LORE_SHIPS = [
  {
    id: 9001,
    name: 'Bengal',
    manufacturer_code: 'RSI',
    manufacturer_name: 'Roberts Space Industries',
    focus: 'Fleet Carrier / Strike Carrier',
    type: 'capital',
    description:
      'The Bengal is a fleet carrier spacecraft developed in SEY 2871 by Roberts Space Industries for the United Empire of Earth Navy. Bengal-class carriers carry a full complement of fighters, bombers and support ships and typically form the nucleus of a Navy battle fleet or task force group. Measuring roughly 1,000 meters in length, it is one of the most powerful symbols of UEE naval might.',
    production_status: 'lore',
    size: 'capital',
    length: 990.0,
    beam: 260.0,
    height: 140.0,
    min_crew: 25,
    max_crew: 750,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6',
    url: 'https://robertsspaceindustries.com/galactapedia/article/RwZBLqLQdp-bengal',
  },
  {
    id: 9002,
    name: 'Pegasus',
    manufacturer_code: 'RSI',
    manufacturer_name: 'Roberts Space Industries',
    focus: 'Escort Carrier',
    type: 'capital',
    description:
      'The Pegasus is an escort-class carrier spacecraft and capital ship manufactured by Roberts Space Industries for the United Empire of Earth military. Capable of supporting the operations of over 30 combat fighters, it is an essential component of UEE Navy strike groups, balancing carrier capacity with strategic fleet mobility.',
    production_status: 'lore',
    size: 'capital',
    length: 700.0,
    beam: 210.0,
    height: 90.0,
    min_crew: 16,
    max_crew: 250,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/5bf35241-66a1-4bb0-a371-498f803c11c6',
    url: 'https://robertsspaceindustries.com/galactapedia/article/bBp64jrA7d-pegasus',
  },
  {
    id: 9003,
    name: 'Retribution',
    manufacturer_code: 'UEE',
    manufacturer_name: 'United Empire of Earth Navy',
    focus: 'Super Dreadnought / Flagship',
    type: 'capital',
    description:
      'Retribution is a colossal dreadnought spacecraft manufactured by the United Empire of Earth military in cooperation with multiple major aerospace manufacturers. Codenamed Project Ouadeen during secret development, it was specifically engineered to counter Vanduul Kingships. Spanning nearly 3,000 meters, the Retribution is the largest military spacecraft ever constructed by Humanity.',
    production_status: 'lore',
    size: 'capital',
    length: 2700.0,
    beam: 550.0,
    height: 380.0,
    min_crew: 150,
    max_crew: 3000,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/33ad3d53-9d2b-4148-b8ed-81f54bbdf661',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/33ad3d53-9d2b-4148-b8ed-81f54bbdf661',
    url: 'https://robertsspaceindustries.com/galactapedia/article/VDoP9a3lKz-retribution',
  },
  {
    id: 9004,
    name: 'Vanduul Kingship',
    manufacturer_code: 'VNCL',
    manufacturer_name: 'Vanduul',
    focus: 'Dreadnought / Fleet Flagship',
    type: 'capital',
    description:
      'Kingship is the UEE military designation for apex Vanduul capital ships that serve as the command flagships of large Vanduul Clans. The Kingship is the largest and most destructive class of Vanduul warship encountered, functioning simultaneously as a dreadnought, fleet carrier, planetary siege platform, and mobile clan city.',
    production_status: 'lore',
    size: 'capital',
    length: 1500.0,
    beam: 420.0,
    height: 310.0,
    min_crew: 50,
    max_crew: 1200,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b',
    url: 'https://robertsspaceindustries.com/galactapedia/article/V3qWn9Dlvm-vanduul-kingship',
  },
  {
    id: 9005,
    name: 'Vanduul Driller',
    manufacturer_code: 'VNCL',
    manufacturer_name: 'Vanduul',
    focus: 'Heavy Escort & Troop Carrier',
    type: 'capital',
    description:
      'The Driller is the UEE Navy military designation for a heavily armored escort and troop carrier operated by the Vanduul. Accompanying large clans during system invasions, it carries boarding teams, specialized armor, and heavy offensive weaponry capable of breaking through planetary defenses.',
    production_status: 'lore',
    size: 'capital',
    length: 400.0,
    beam: 180.0,
    height: 95.0,
    min_crew: 12,
    max_crew: 180,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/4f83dad0-51e3-4caa-b997-f5833850ecfb',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/4f83dad0-51e3-4caa-b997-f5833850ecfb',
    url: 'https://robertsspaceindustries.com/galactapedia/article/V3GPzWDO1A-driller',
  },
  {
    id: 9006,
    name: 'Vanduul Void',
    manufacturer_code: 'VNCL',
    manufacturer_name: 'Vanduul',
    focus: 'Heavy Bomber',
    type: 'combat',
    description:
      'The Void is the official UEE Navy designation for the standard heavy bomber deployed by Vanduul assault fleets. Designed to breach capital ship hulls and deliver catastrophic payloads against naval stations and defensive orbital emplacements.',
    production_status: 'lore',
    size: 'medium',
    length: 45.0,
    beam: 38.0,
    height: 12.0,
    min_crew: 1,
    max_crew: 3,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/470ba15b-2048-48eb-b519-86548b8254a3',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/470ba15b-2048-48eb-b519-86548b8254a3',
    url: 'https://robertsspaceindustries.com/galactapedia/article/RWozkp8l82-void',
  },
  {
    id: 9007,
    name: 'Vanduul Harvester',
    manufacturer_code: 'VNCL',
    manufacturer_name: 'Vanduul',
    focus: 'Planetary Stripping & Mining',
    type: 'industrial',
    description:
      'The Vanduul Harvester is an industrial platform observed deploying planet-side machinery to consume natural resources and mineral veins directly from planetary crusts during clan expansion raids.',
    production_status: 'lore',
    size: 'large',
    length: 260.0,
    beam: 110.0,
    height: 80.0,
    min_crew: 8,
    max_crew: 80,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/138553b2-808f-456c-bad3-18721c1a9b9b',
    url: 'https://robertsspaceindustries.com/galactapedia/article/0n1MYzOkG7-harvester',
  },
  {
    id: 9008,
    name: 'Zeus (Historical 2140)',
    manufacturer_code: 'RSI',
    manufacturer_name: 'Roberts Space Industries',
    focus: 'Historical Quantum Explorer',
    type: 'exploration',
    description:
      'The Zeus was a pioneering spacecraft developed in 2140 by Roberts Space Industries, representing the first commercial ship equipped with a quantum drive accessible to civilians. Its release revolutionized Human space exploration and catalyzed the colonization of the solar system and neighboring star systems.',
    production_status: 'lore',
    size: 'medium',
    length: 42.0,
    beam: 24.0,
    height: 10.0,
    min_crew: 1,
    max_crew: 3,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/fc45323f-6d37-4112-a418-28b525a202f4',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/fc45323f-6d37-4112-a418-28b525a202f4',
    url: 'https://robertsspaceindustries.com/galactapedia/article/VYLd4WxODo-zeus',
  },
  {
    id: 9009,
    name: 'F8A Lightning (Military)',
    manufacturer_code: 'ANVL',
    manufacturer_name: 'Anvil Aerospace',
    focus: 'Space Superiority Fighter',
    type: 'combat',
    description:
      'The F8A Lightning is the elite, military-spec space superiority heavy fighter deployed exclusively by the United Empire of Earth Navy (featured in Squadron 42). Featuring heavier armor, unrestricted military hardpoints, and triple high-output thrusters, it represents the pinnacle of UEE dogfighting technology.',
    production_status: 'lore',
    size: 'small',
    length: 26.0,
    beam: 22.0,
    height: 7.5,
    min_crew: 1,
    max_crew: 1,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580',
    url: 'https://robertsspaceindustries.com/galactapedia/article/bZwQ7r6nkE-f8a-lightning',
  },
  {
    id: 9010,
    name: 'F7A Hornet (Military)',
    manufacturer_code: 'ANVL',
    manufacturer_name: 'Anvil Aerospace',
    focus: 'Military Carrier Fighter',
    type: 'combat',
    description:
      'The F7A Hornet is the iconic frontline carrier-based medium fighter of the UEE Navy. Featured prominently throughout Squadron 42 and naval defense operations, the military F7A differs from civilian F7C models with reinforced plating, military-grade thrusters, and specialized naval weaponry.',
    production_status: 'lore',
    size: 'small',
    length: 22.5,
    beam: 21.5,
    height: 6.8,
    min_crew: 1,
    max_crew: 1,
    media_store_small: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580',
    media_store_large: 'https://cig-galactapedia-prod.s3.amazonaws.com/upload/07841eb5-c02a-49b6-a422-2fc5449f8580',
    url: 'https://robertsspaceindustries.com/galactapedia/article/RXlXgwDlDk-F7A-Hornet',
  },
];

export async function seedLoreAndFixStingray(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log('Seeding lore ships into rsi.ship_matrix...');
  for (const ship of LORE_SHIPS) {
    await client.query(
      `INSERT INTO rsi.ship_matrix (
        id, name, manufacturer_code, manufacturer_name, focus, type,
        description, production_status, size, length, beam, height,
        min_crew, max_crew, media_store_small, media_store_large, url, synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
      ON CONFLICT (id) DO UPDATE SET
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
        synced_at = NOW()`,
      [
        ship.id,
        ship.name,
        ship.manufacturer_code,
        ship.manufacturer_name,
        ship.focus,
        ship.type,
        ship.description,
        ship.production_status,
        ship.size,
        ship.length,
        ship.beam,
        ship.height,
        ship.min_crew,
        ship.max_crew,
        ship.media_store_small,
        ship.media_store_large,
        ship.url,
      ],
    );
  }
  console.log(`Successfully upserted ${LORE_SHIPS.length} lore ships.`);

  // Ensure Kruger and UEE manufacturers exist
  await client.query(
    `INSERT INTO game.manufacturers (code, name, known_for)
     VALUES ('KRIG', 'Kruger Intergalactic', 'Snub & Medium Fighters')
     ON CONFLICT (code) DO NOTHING`,
  );
  await client.query(
    `INSERT INTO game.manufacturers (code, name, known_for)
     VALUES ('UEE', 'United Empire of Earth Navy', 'Naval Defense Command')
     ON CONFLICT (code) DO NOTHING`,
  );

  // Link Kruger S-65 Stingray
  console.log('Linking S-65 Stingray in game.ships...');
  await client.query(
    `INSERT INTO game.ships (
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
    )
    ON CONFLICT (uuid, env) DO UPDATE SET
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
      extracted_at = NOW()`,
  );

  // Also insert ballistic variant
  await client.query(
    `INSERT INTO game.ships (
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
    )
    ON CONFLICT (uuid, env) DO UPDATE SET
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
      extracted_at = NOW()`,
  );

  // Also insert F8A Lightning (Military)
  await client.query(
    `INSERT INTO game.ships (
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
    )
    ON CONFLICT (uuid, env) DO UPDATE SET
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
      extracted_at = NOW()`,
  );

  // Update extraction log count
  await client.query(
    `UPDATE meta.extraction_log
     SET ships_count = (SELECT COUNT(*) FROM game.ships WHERE env = 'live')
     WHERE id = (SELECT id FROM meta.extraction_log ORDER BY extracted_at DESC LIMIT 1)`,
  );

  await client.end();
  console.log('Seeding and linking complete!');
}

async function run() {
  await seedLoreAndFixStingray(process.env.DATABASE_URL || 'postgresql://starvis_user:starvis_pass@localhost:5432/starvis');
}

run().catch(console.error);
