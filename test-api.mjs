const API_BASE = 'http://localhost:3000/api/v1';

async function testAPIs() {
  try {
    console.log('🧪 Testing API Endpoints...\n');

    // Test 1: Get items with limit 1
    console.log('1️⃣ Testing GET /items?env=live&limit=1');
    let res = await fetch(`${API_BASE}/items?env=live&limit=1`);
    let data = await res.json();
    
    if (data.data && data.data.length > 0) {
      const itemId = data.data[0].uuid;
      console.log(`   ✅ Got ${data.data.length} item(s)`);
      console.log(`   📍 Sample item UUID: ${itemId}`);
      console.log(`   🔍 Fields: ${Object.keys(data.data[0]).join(', ')}`);
      
      // Test 2: Get item detail
      console.log(`\n2️⃣ Testing GET /items/{uuid}`);
      res = await fetch(`${API_BASE}/items/${itemId}?env=live`);
      data = await res.json();
      
      if (data.data) {
        console.log(`   ✅ Got item detail`);
        console.log(`   📍 Item: ${data.data.name || 'N/A'}`);
        
        const extendedFields = [
          'weapon_damage', 'weapon_fire_rate', 'armor_damage_reduction',
          'data_json', 'game_data'
        ];
        
        const presentFields = extendedFields.filter(f => f in data.data);
        const missingFields = extendedFields.filter(f => !(f in data.data));
        
        console.log(`   ✨ Extended fields present: ${presentFields.length}/${extendedFields.length}`);
        if (presentFields.length > 0) {
          console.log(`      Present: ${presentFields.join(', ')}`);
        }
        if (missingFields.length > 0) {
          console.log(`      ⚠️  Missing: ${missingFields.join(', ')}`);
        }
      }
    } else {
      console.log(`   ❌ No items returned`);
    }

    // Test 3: Get components
    console.log(`\n3️⃣ Testing GET /components?env=live&limit=1`);
    res = await fetch(`${API_BASE}/components?env=live&limit=1`);
    data = await res.json();
    
    if (data.data && data.data.length > 0) {
      const componentId = data.data[0].uuid;
      console.log(`   ✅ Got ${data.data.length} component(s)`);
      console.log(`   📍 Sample component UUID: ${componentId}`);
      
      // Test 4: Get component detail
      console.log(`\n4️⃣ Testing GET /components/{uuid}`);
      res = await fetch(`${API_BASE}/components/${componentId}?env=live`);
      data = await res.json();
      
      if (data.data) {
        console.log(`   ✅ Got component detail`);
        console.log(`   📍 Component: ${data.data.name || 'N/A'}`);
        
        const extendedFields = [
          'weapon_damage', 'shield_hp', 'qd_speed', 'thruster_max_thrust',
          'mining_speed', 'data_json', 'game_data'
        ];
        
        const presentFields = extendedFields.filter(f => f in data.data);
        const missingFields = extendedFields.filter(f => !(f in data.data));
        
        console.log(`   ✨ Extended fields present: ${presentFields.length}/${extendedFields.length}`);
        if (presentFields.length > 0) {
          console.log(`      Present: ${presentFields.join(', ')}`);
        }
        if (missingFields.length > 0) {
          console.log(`      ⚠️  Missing: ${missingFields.join(', ')}`);
        }
      }
    } else {
      console.log(`   ❌ No components returned`);
    }

    // Test 5: Get commodities
    console.log(`\n5️⃣ Testing GET /commodities?env=live&limit=1`);
    res = await fetch(`${API_BASE}/commodities?env=live&limit=1`);
    data = await res.json();
    
    if (data.data && data.data.length > 0) {
      const commodityId = data.data[0].uuid;
      console.log(`   ✅ Got ${data.data.length} commodit(ies)`);
      console.log(`   📍 Sample commodity UUID: ${commodityId}`);
      
      // Test 6: Get commodity detail
      console.log(`\n6️⃣ Testing GET /commodities/{uuid}`);
      res = await fetch(`${API_BASE}/commodities/${commodityId}?env=live`);
      data = await res.json();
      
      if (data.data) {
        console.log(`   ✅ Got commodity detail`);
        console.log(`   📍 Commodity: ${data.data.name || 'N/A'}`);
        
        const extendedFields = [
          'data_json', 'game_data'
        ];
        
        const presentFields = extendedFields.filter(f => f in data.data);
        const missingFields = extendedFields.filter(f => !(f in data.data));
        
        console.log(`   ✨ Extended fields present: ${presentFields.length}/${extendedFields.length}`);
        if (presentFields.length > 0) {
          console.log(`      Present: ${presentFields.join(', ')}`);
        }
        if (missingFields.length > 0) {
          console.log(`      ⚠️  Missing: ${missingFields.join(', ')}`);
        }
      }
    } else {
      console.log(`   ❌ No commodities returned`);
    }
    
    console.log(`\n✅ All tests completed!`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

testAPIs();
