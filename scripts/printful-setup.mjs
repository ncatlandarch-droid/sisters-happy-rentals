/**
 * Sisters Happy Rentals — Printful Store Setup
 * Uses the same Think! Apparel store (18232014)
 * Designs hosted on sisters-happy-rentals.netlify.app
 */
const PRINTFUL_KEY = process.env.PRINTFUL_API_KEY;
if (!PRINTFUL_KEY) { console.error('ERROR: Set PRINTFUL_API_KEY'); process.exit(1); }

const SITE_URL = 'https://sisters-happy-rentals.netlify.app';
const STORE_ID = '18232014'; // Think! Apparel store

async function pf(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${PRINTFUL_KEY}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': STORE_ID,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.printful.com${endpoint}`, opts);
  return res.json();
}

async function uploadDesign(file) {
  const r = await pf('/files', 'POST', {
    type: 'default',
    url: `${SITE_URL}/printful-designs/${file}`,
    filename: file,
  });
  return r.code === 200 ? r.result.id : null;
}

// CONFIRMED variant IDs from V2 catalog API (Black, S through 2XL)
const TEE_BLACK = [4016, 4017, 4018, 4019, 4020];     // Bella+Canvas 3001
const HOODIE_BLACK = [5530, 5531, 5532, 5533, 5534];  // Gildan 18500
const CAP_BLACK = [7854];                               // Yupoong snapback

// WHITE tee variant IDs — need to look up
const TEE_WHITE = [];  // Will look up with --lookup

const PRODUCTS = [
  // T-SHIRTS (Black) — transparent logo on dark
  {
    name: 'Sisters Happy Rentals Logo Tee',
    variants: TEE_BLACK,
    placement: 'front',
    design: 'sisters-logo-print.png',
    price: '32.00',
    thumb: '/printful-designs/sisters-logo-print.png',
  },
  // HOODIES (Black) — transparent logo on dark
  {
    name: 'Sisters Happy Rentals Logo Hoodie',
    variants: HOODIE_BLACK,
    placement: 'front',
    design: 'sisters-logo-print.png',
    price: '52.00',
    thumb: '/printful-designs/sisters-logo-print.png',
  },
  // CAPS — embroidery
  {
    name: 'Sisters Happy Rentals Embroidered Cap',
    variants: CAP_BLACK,
    placement: 'embroidery_front_large',
    design: 'sisters-logo-print.png',
    price: '28.00',
    thumb: '/printful-designs/sisters-logo-print.png',
    threadColors: ['#FFFFFF', '#C78F5C', '#6B2D5B'],
  },
];

async function main() {
  // Handle --lookup flag
  if (process.argv[2] === '--lookup') {
    const catId = process.argv[3] || '71';
    const color = process.argv[4] || 'Black';
    let variants = [];
    let url = `https://api.printful.com/v2/catalog-products/${catId}/catalog-variants?limit=100`;
    let page = 0;
    while (url && page < 10) {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${PRINTFUL_KEY}` } });
      const d = await r.json();
      variants = variants.concat(d.data || []);
      url = d._links?.next?.href || null;
      page++;
    }
    const filtered = variants.filter(v => v.color === color);
    console.log(`\nFound ${filtered.length} "${color}" variants for catalog product ${catId}:\n`);
    filtered.forEach(v => console.log(`  ${v.id} | ${v.size} | ${v.color}`));
    console.log(`\nCopy-paste: [${filtered.map(v => v.id).join(', ')}]`);
    return;
  }

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  Sisters Happy Rentals — Printful Store Setup     ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // Verify store
  console.log('▸ Verifying store connection...');
  const stores = await pf('/stores');
  const store = (stores.result || []).find(s => String(s.id) === STORE_ID);
  console.log(`  Store: ${store ? store.name : 'NOT FOUND'} (${STORE_ID})\n`);
  if (!store) { console.error('ERROR: Store not found. Check STORE_ID.'); process.exit(1); }

  // Check existing products
  console.log('▸ Checking existing products...');
  const existing = await pf('/store/products');
  const existingNames = (existing.result || []).map(p => p.name);
  console.log(`  ${existingNames.length} products already in store\n`);

  // Create products
  console.log('▸ Creating products...\n');
  let created = 0, failed = 0, skipped = 0;

  for (const prod of PRODUCTS) {
    process.stdout.write(`  ${prod.name}...`);

    if (existingNames.includes(prod.name)) {
      console.log(' ⏭️ already exists');
      skipped++;
      continue;
    }

    try {
      const fileId = await uploadDesign(prod.design);
      if (!fileId) { console.log(' ❌ upload failed'); failed++; continue; }

      const syncVariants = prod.variants.map(vid => {
        const file = { type: prod.placement, id: fileId };
        const variant = { variant_id: vid, retail_price: prod.price, files: [file] };
        if (prod.threadColors) {
          variant.options = [{ id: 'thread_colors_front_large', value: prod.threadColors }];
        }
        return variant;
      });

      const res = await pf('/store/products', 'POST', {
        sync_product: { name: prod.name, thumbnail: `${SITE_URL}${prod.thumb}` },
        sync_variants: syncVariants,
      });

      if (res.code === 200) {
        console.log(` ✅ (${prod.variants.length} variants)`);
        created++;
      } else {
        console.log(` ❌ ${res.error?.message || JSON.stringify(res).substring(0, 150)}`);
        failed++;
      }
    } catch (err) {
      console.log(` ❌ ${err.message}`);
      failed++;
    }
  }

  // Verify
  console.log('\n▸ Verifying...');
  await new Promise(r => setTimeout(r, 2000));
  const verify = await pf('/store/products');
  if (verify.result) {
    console.log(`\n  ✅ ${verify.result.length} products in store:\n`);
    verify.result.forEach(p => console.log(`    [${p.id}] ${p.name} — ${p.variants} variant(s)`));
  }

  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  Created: ${created} | Skipped: ${skipped} | Failed: ${failed}                ║`);
  console.log(`║  Store ID: ${STORE_ID}                              ║`);
  console.log(`╚═══════════════════════════════════════════════════╝\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
