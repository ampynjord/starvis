import { P4kProvider } from './src/providers/p4k-provider.ts';

const p4k = new P4kProvider('/game/Data.p4k');
await p4k.init();

console.log('📦 P4K ouvert:', p4k.getFileCount(), 'fichiers\n');

// Tous les vaisseaux
const ships = p4k.listFiles('Data/Libs/Foundry/Records/entities/scitem/ships')
  .filter(f => f.endsWith('.xml'))
  .map(f => f.split('/').pop().replace('.xml', ''))
  .sort();

console.log(`🚀 Total vaisseaux DataForge: ${ships.length}\n`);

// Chercher des noms suspects/nouveaux
const knownShips = [
  'AEGS_Avenger', 'AEGS_Gladius', 'AEGS_Hammerhead', 'AEGS_Idris', 'AEGS_Javelin',
  'AEGS_Reclaimer', 'AEGS_Redeemer', 'AEGS_Retaliator', 'AEGS_Sabre', 'AEGS_Vanguard',
  'ANVL_Arrow', 'ANVL_Ballista', 'ANVL_Carrack', 'ANVL_Gladiator', 'ANVL_Hawk',
  'ANVL_Hornet', 'ANVL_Hurricane', 'ANVL_Lightning', 'ANVL_Spartan', 'ANVL_Terrapin',
  'ANVL_Valkyrie', 'CNOU_HoverQuad', 'CNOU_Mustang', 'CNOU_Nomad', 'CRUS_Ares',
  'CRUS_Hercules', 'CRUS_Mercury', 'CRUS_MSR', 'CRUS_Starlifter', 'DRAK_Buccaneer',
  'DRAK_Caterpillar', 'DRAK_Corsair', 'DRAK_Cutlass', 'DRAK_Dragonfly', 'DRAK_Herald',
  'DRAK_Vulture', 'MISC_Freelancer', 'MISC_Hull', 'MISC_Prospector', 'MISC_Razor',
  'MISC_Reliant', 'MISC_Starfarer', 'ORIG_100i', 'ORIG_300i', 'ORIG_400i',
  'ORIG_600i', 'ORIG_890Jump', 'ORIG_M50', 'RSI_Aurora', 'RSI_Constellation',
  'RSI_Mantis', 'RSI_Polaris', 'RSI_Zeus'
];

console.log('🔍 Vaisseaux potentiellement nouveaux/suspects:\n');
ships.forEach(ship => {
  const isKnown = knownShips.some(known => ship.includes(known.split('_')[1]));
  if (!isKnown && !ship.includes('Template') && !ship.includes('Test')) {
    console.log(`  ⭐ ${ship}`);
  }
});

console.log('\n📋 Liste complète:\n');
ships.forEach(s => console.log(`  - ${s}`));
