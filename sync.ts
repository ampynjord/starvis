import mysql from "mysql2/promise";
import { ShipMatrixProvider } from "./src/providers/rsi-providers.js";

const connection = await mysql.createConnection({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "rootpassword",
  database: "starapi",
});

console.log("🚀 Synchronisation complète depuis ship-matrix API...\n");

const provider = new ShipMatrixProvider();
const ships = await provider.getAllShips();
console.log(`📦 ${ships.length} vaisseaux récupérés depuis l'API\n`);

let stats = {
  ships: { inserted: 0, updated: 0, errors: 0 },
  images: 0,
  specifications: 0,
};

// ===== SYNCHRONISATION DES VAISSEAUX =====
console.log("⚙️  Synchronisation des vaisseaux...");
for (const ship of ships) {
  try {
    const transformed = provider.transformShipData(ship);

    const [result] = await connection.execute(
      `INSERT INTO ships (
        id, chassis_id, name, manufacturer, slug, url, description, focus, 
        production_status, size, type, crew_min, crew_max, 
        mass_kg, cargo_capacity, length_m, beam_m, height_m,
        scm_speed, pledge_url, media_store_thumb, media_store_banner, 
        data_source, synced_at, last_modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        manufacturer = VALUES(manufacturer),
        slug = VALUES(slug),
        url = VALUES(url),
        description = VALUES(description),
        focus = VALUES(focus),
        production_status = VALUES(production_status),
        size = VALUES(size),
        type = VALUES(type),
        crew_min = VALUES(crew_min),
        crew_max = VALUES(crew_max),
        mass_kg = VALUES(mass_kg),
        cargo_capacity = VALUES(cargo_capacity),
        length_m = VALUES(length_m),
        beam_m = VALUES(beam_m),
        height_m = VALUES(height_m),
        scm_speed = VALUES(scm_speed),
        pledge_url = VALUES(pledge_url),
        media_store_thumb = VALUES(media_store_thumb),
        media_store_banner = VALUES(media_store_banner),
        data_source = VALUES(data_source),
        synced_at = VALUES(synced_at),
        chassis_id = VALUES(chassis_id),
        last_modified_at = VALUES(last_modified_at)`,
      [
        transformed.id,
        transformed.chassisId ?? null,
        transformed.name,
        transformed.manufacturer ?? null,
        transformed.slug ?? null,
        transformed.url ?? null,
        transformed.description ?? null,
        transformed.focus ?? null,
        transformed.productionStatus ?? null,
        transformed.size ?? null,
        transformed.type ?? null,
        transformed.crew?.min ?? null,
        transformed.crew?.max ?? null,
        transformed.mass ?? null,
        transformed.cargocapacity ?? null,
        transformed.length ?? null,
        transformed.beam ?? null,
        transformed.height ?? null,
        transformed.scmSpeed ?? null,
        transformed.pledgeUrl ?? null,
        transformed.media?.storeThumb ?? null,
        transformed.media?.storeBanner ?? null,
        transformed.dataSource ?? "ship-matrix",
        transformed.syncedAt ?? new Date(),
        transformed.lastModified ?? null,
      ]
    );

    if ((result as any).affectedRows === 1) {
      stats.ships.inserted++;
    } else {
      stats.ships.updated++;
    }
  } catch (error: any) {
    console.log(`   ❌ ${ship.name}: ${error.message}`);
    stats.ships.errors++;
  }
}

console.log(
  `   ✅ ${stats.ships.inserted} insérés, ${stats.ships.updated} mis à jour, ${stats.ships.errors} erreurs\n`
);

// ===== SYNCHRONISATION DES IMAGES =====
console.log("🖼️  Synchronisation des images...");

// Supprimer les anciennes images
await connection.execute("DELETE FROM ship_images");

// Insérer les nouvelles images
for (const ship of ships) {
  const transformed = provider.transformShipData(ship);

  if (transformed.mediaGallery && transformed.mediaGallery.length > 0) {
    for (const image of transformed.mediaGallery) {
      await connection.execute(
        `INSERT INTO ship_images (ship_id, url, type, alt) VALUES (?, ?, ?, ?)`,
        [transformed.id, image.url, image.type, image.alt ?? null]
      );
      stats.images++;
    }
  }
}

console.log(`   ✅ ${stats.images} images insérées\n`);

// ===== SYNCHRONISATION DES SPÉCIFICATIONS =====
console.log("📝 Synchronisation des spécifications...");

// Supprimer les anciennes spécifications
await connection.execute("DELETE FROM ship_specifications");

// Insérer les nouvelles spécifications
for (const ship of ships) {
  const transformed = provider.transformShipData(ship);

  if (transformed.specifications && transformed.specifications.length > 0) {
    for (const spec of transformed.specifications) {
      await connection.execute(
        `INSERT INTO ship_specifications (ship_id, name, value) VALUES (?, ?, ?)`,
        [transformed.id, spec.name ?? null, spec.value ?? null]
      );
      stats.specifications++;
    }
  }
}

console.log(`   ✅ ${stats.specifications} spécifications insérées\n`);

// ===== STATISTIQUES FINALES =====
const [ships_count] = await connection.query(
  "SELECT COUNT(*) as count FROM ships"
);
const [images_count] = await connection.query(
  "SELECT COUNT(*) as count FROM ship_images"
);
const [specs_count] = await connection.query(
  "SELECT COUNT(*) as count FROM ship_specifications"
);

console.log("🎉 Synchronisation terminée !\n");
console.log("📊 Base de données :");
console.log(`   - ${(ships_count as any)[0].count} vaisseaux`);
console.log(`   - ${(images_count as any)[0].count} images`);
console.log(`   - ${(specs_count as any)[0].count} spécifications`);

await connection.end();
