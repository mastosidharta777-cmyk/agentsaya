const fs = require('fs');
const path = require('path');

// Baca file .env.local
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testNativeFetch() {
  console.log('Memanggil API Supabase via Native Fetch...');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/agents?select=count`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    console.log('✅ HTTP STATUS:', res.status);
    const body = await res.text();
    console.log('✅ RESPONSE BODY:', body);
  } catch (err) {
    console.error('❌ RAW FETCH ERROR:', err.message);
    console.error('🔍 KODE ERROR ASLI (CAUSE):', err.cause);
  }
}

testNativeFetch();