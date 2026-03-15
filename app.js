// ===========================
// ON THE LINE — OTL App JS
// Supabase-backed version
// ===========================

const SUPABASE_URL = 'https://bvlklpbixjydftsdlojc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vvuln9rUfI-sEAWoTeCnNQ_nQQq4mdq';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===========================
// DATA STORE
// ===========================

let state = {
  clients: [],
  quotes: [],
  inspections: [],
  activeClientFilter: 'all',
  viewingClientId: null,
  pendingClientForQuote: null,
  pendingClientForInspection: null,
  actionPlans: [],
  viewingPlanId: null,
  user: null,
  profile: null, // { role: 'admin' | 'client', client_id: null | 'xxx' }
};

const ADMIN_EMAIL = 'chris@easycheesytruck.com';

// ===========================
// AUTH
// ===========================

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    state.user = session.user;
    await loadOrCreateProfile();
    document.getElementById('login-screen').classList.add('hidden');
    await loadFromSupabase();
    applyRoleUI();
    renderAll();
    return;
  }
  document.getElementById('login-screen').classList.remove('hidden');
}

async function loadOrCreateProfile() {
  const userId = state.user.id;
  const email = state.user.email;

  // Try to load existing profile
  const { data: profile, error: profileErr } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();

  if (profile) {
    state.profile = { role: profile.role, clientId: profile.client_id, email: profile.email };
    return;
  }

  // No profile yet — create one
  // Check if this is the admin email or first user
  const isAdmin = email === ADMIN_EMAIL;

  // If not admin, try to match email to a client record
  let linkedClientId = null;
  if (!isAdmin) {
    const { data: matchingClient } = await db.from('clients').select('id').eq('email', email).single();
    if (matchingClient) linkedClientId = matchingClient.id;
  }

  const newProfile = {
    user_id: userId,
    role: isAdmin ? 'admin' : 'client',
    client_id: linkedClientId,
    email: email,
    created_at: Date.now(),
  };

  await db.from('profiles').insert(newProfile);
  state.profile = { role: newProfile.role, clientId: linkedClientId, email };
}

function isAdmin() {
  return state.profile && state.profile.role === 'admin';
}

function applyRoleUI() {
  // Hide admin-only elements for client users
  const adminEls = document.querySelectorAll('.admin-only');
  const clientEls = document.querySelectorAll('.client-only');

  if (isAdmin()) {
    adminEls.forEach(el => el.style.display = '');
    clientEls.forEach(el => el.style.display = '');
  } else {
    adminEls.forEach(el => el.style.display = 'none');
    clientEls.forEach(el => el.style.display = '');
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Enter email and password';
    errEl.style.display = 'block';
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    errEl.style.display = 'block';
    return;
  }

  state.user = data.user;
  await loadOrCreateProfile();
  document.getElementById('login-screen').classList.add('hidden');
  await loadFromSupabase();
  applyRoleUI();
  renderAll();
  toast('Signed in');
}

async function handleSignup() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Enter email and password';
    errEl.style.display = 'block';
    return;
  }

  if (password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters';
    errEl.style.display = 'block';
    return;
  }

  const { data, error } = await db.auth.signUp({ email, password });
  if (error) {
    errEl.textContent = error.message;
    errEl.style.display = 'block';
    return;
  }

  // Auto-confirm is on by default for new Supabase projects
  if (data.session) {
    state.user = data.user;
    await loadOrCreateProfile();
    document.getElementById('login-screen').classList.add('hidden');
    await loadFromSupabase();
    applyRoleUI();
    renderAll();
    toast('Account created — welcome!');
  } else {
    errEl.textContent = 'Check your email to confirm your account';
    errEl.style.display = 'block';
    errEl.style.color = 'var(--success)';
  }
}

async function handleLogout() {
  await db.auth.signOut();
  state.user = null;
  state.clients = [];
  state.quotes = [];
  state.inspections = [];
  document.getElementById('login-screen').classList.remove('hidden');
  toast('Signed out');
}

// ===========================
// DATA FIXUP (runs every login until clean)
// ===========================

async function fixupData() {
  // Fix Mariah's client record
  await db.from('clients').upsert({
    id: 'seed_mariah_wild',
    name: 'Mariah Wild',
    biz: '',
    phone: '',
    email: 'mariah.wild@gmail.com',
    type: 'freelancer',
    status: 'active',
    notes: 'Photo shoot for portfolio. 15 hrs consulting + 1 mo retainer + 1,485 mi travel. Total: $2,519.95. Deposit PAID ($1,259.97). Balance due: $1,259.97.',
    created_at: 1710393600000,
    updated_at: Date.now(),
  });

  // Add Mariah's quote
  const { error: quoteErr } = await db.from('quotes').upsert({
    id: 'seed_mariah_quote_1',
    client_id: 'seed_mariah_wild',
    services: {
      inspection: false,
      session: true, sessionHrs: 15,
      starterPkg: false, starterPkgAmt: 500,
      fullBuild: false, fullBuildAmt: 1000,
      retainer: true, retainerMos: 1,
      travel: true, travelMiles: 1485,
    },
    total: 2519.95,
    notes: 'Photo shoot for portfolio. Deposit PAID ($1,259.97). Balance due: $1,259.97.',
    status: 'accepted',
    created_at: 1710393600000,
    updated_at: Date.now(),
  });
  if (quoteErr) console.error('MARIAH QUOTE ERROR:', quoteErr);
  else console.log('Mariah quote upserted OK');

  console.log('Data fixup complete');
}

// ===========================
// ONE-TIME MIGRATION
// ===========================

async function migrateLocalStorage() {
  // Only run once per version
  if (localStorage.getItem('otl_migrated_v4')) return;

  // Pull old localStorage data
  const oldClients = JSON.parse(localStorage.getItem('otl_clients') || '[]');
  const oldQuotes = JSON.parse(localStorage.getItem('otl_quotes') || '[]');
  const oldInspections = JSON.parse(localStorage.getItem('otl_inspections') || '[]');

  // Seed known clients if not already present
  const seeds = [
    {
      id: 'seed_wil_eichler',
      name: 'Wil Eichler',
      biz: "McDivot's Sports Bar and Grill",
      phone: '',
      email: '',
      type: 'brick_mortar',
      status: 'active',
      notes: 'Also ECLS commissary (10706 Countryway Blvd, Tampa FL 33626). Wants mobile revenue stream — bought used enclosed custom-built trailer. Inspection COMPLETED March 13, 2026 — PASS (33 pass, 8 attention, 7 fail). Invoice OTL-INV-2026-001 sent $300 due March 28. Proposal OTL-P-2026-001 sent $3,555 total — valid through April 12, 2026. Waiting on proposal acceptance + $1,777.50 deposit.',
      createdAt: 1710300000000,
      updatedAt: Date.now(),
    },
    {
      id: 'seed_mariah_wild',
      name: 'Mariah Wild',
      biz: '',
      phone: '',
      email: 'mariah.wild@gmail.com',
      type: 'freelancer',
      status: 'active',
      notes: 'Photo shoot for portfolio. 15 hrs consulting + 1 mo retainer + 1,485 mi travel. Total: $2,519.95. Deposit PAID ($1,259.97). Balance due: $1,259.97.',
      createdAt: 1710393600000,
      updatedAt: Date.now(),
    },
  ];

  for (const seed of seeds) {
    const exists = oldClients.some(c => c.id === seed.id || (c.name && c.name.toLowerCase() === seed.name.toLowerCase()));
    if (!exists) oldClients.push(seed);
  }

  // Seed Mariah's quote
  const hasMariahQuote = oldQuotes.some(q => q.clientId === 'seed_mariah_wild');
  if (!hasMariahQuote) {
    oldQuotes.push({
      id: 'seed_mariah_quote_1',
      clientId: 'seed_mariah_wild',
      services: {
        inspection: false,
        session: true, sessionHrs: 15,
        starterPkg: false, starterPkgAmt: 500,
        fullBuild: false, fullBuildAmt: 1000,
        retainer: true, retainerMos: 1,
        travel: true, travelMiles: 1485,
      },
      total: 2519.95,
      notes: 'Photo shoot for portfolio. Deposit PAID ($1,259.97). Balance due: $1,259.97.',
      status: 'accepted',
      createdAt: 1710393600000,
      updatedAt: Date.now(),
    });
  }

  // Seed Wil's inspection
  const hasWilInspection = oldInspections.some(i => i.clientId === 'seed_wil_eichler');
  if (!hasWilInspection) {
    oldInspections.push({
      id: 'seed_wil_inspection_1',
      clientId: 'seed_wil_eichler',
      unit: 'Used enclosed custom-built trailer',
      notes: 'Solid buy — issues are cosmetic/maintenance/compliance, not structural. Key fails: equipment not mounted, heavy grease in hood, no thermometers, no first aid kit, emergency shutoff not marked, no health permit, food handler certs unverified. Key attention: flat tires, hitch, outlets, breaker panel unlabeled, fire suppression tag expired. Recommendation: wrap exterior immediately.',
      rating: 'pass',
      results: {},
      createdAt: 1710300000000,
      updatedAt: Date.now(),
    });
  }

  // Seed Wil's quote (the $3,555 proposal)
  const hasWilQuote = oldQuotes.some(q => q.clientId === 'seed_wil_eichler');
  if (!hasWilQuote) {
    oldQuotes.push({
      id: 'seed_wil_quote_1',
      clientId: 'seed_wil_eichler',
      services: {
        inspection: true,
        session: true, sessionHrs: 3,
        starterPkg: false, starterPkgAmt: 500,
        fullBuild: true, fullBuildAmt: 1500,
        retainer: true, retainerMos: 6,
        travel: false, travelMiles: 0,
      },
      total: 3555,
      notes: 'Proposal OTL-P-2026-001. Inspection $300 + 3hrs consulting $255 + Full System Build $1,500 + 6-month retainer $1,500. Valid through April 12, 2026.',
      status: 'sent',
      createdAt: 1710300000000,
      updatedAt: Date.now(),
    });
  }

  if (oldClients.length === 0 && oldQuotes.length === 0 && oldInspections.length === 0) {
    localStorage.setItem('otl_migrated_v4', 'true');
    return;
  }

  console.log(`Migrating: ${oldClients.length} clients, ${oldQuotes.length} quotes, ${oldInspections.length} inspections`);

  // Upsert clients first (quotes/inspections reference them)
  for (const c of oldClients) {
    const { error } = await db.from('clients').upsert({
      id: c.id, name: c.name, biz: c.biz || '', phone: c.phone || '',
      email: c.email || '', type: c.type || 'food_truck', status: c.status || 'prospect',
      notes: c.notes || '', created_at: c.createdAt || Date.now(), updated_at: c.updatedAt || Date.now(),
    });
    if (error) console.error('Migrate client error:', error);
  }

  for (const q of oldQuotes) {
    const { error } = await db.from('quotes').upsert({
      id: q.id, client_id: q.clientId, services: q.services || {},
      total: q.total || 0, notes: q.notes || '', status: q.status || 'draft',
      created_at: q.createdAt || Date.now(), updated_at: q.updatedAt || Date.now(),
    });
    if (error) console.error('Migrate quote error:', error);
  }

  for (const i of oldInspections) {
    const { error } = await db.from('inspections').upsert({
      id: i.id, client_id: i.clientId, unit: i.unit || '',
      notes: i.notes || '', rating: i.rating || 'pass', results: i.results || {},
      created_at: i.createdAt || Date.now(), updated_at: i.updatedAt || Date.now(),
    });
    if (error) console.error('Migrate inspection error:', error);
  }

  localStorage.setItem('otl_migrated_v4', 'true');
  console.log('Migration complete');
}

// ===========================
// SUPABASE DATA
// ===========================

async function loadFromSupabase() {
  const [clientsRes, quotesRes, inspectionsRes, plansRes] = await Promise.all([
    db.from('clients').select('*').order('created_at', { ascending: false }),
    db.from('quotes').select('*').order('created_at', { ascending: false }),
    db.from('inspections').select('*').order('created_at', { ascending: false }),
    db.from('action_plans').select('*').order('created_at', { ascending: false }),
  ]);

  // Map DB columns (snake_case) to app state (camelCase)
  state.clients = (clientsRes.data || []).map(c => ({
    id: c.id, name: c.name, biz: c.biz, phone: c.phone, email: c.email,
    type: c.type, status: c.status, notes: c.notes,
    createdAt: c.created_at, updatedAt: c.updated_at,
  }));

  state.quotes = (quotesRes.data || []).map(q => ({
    id: q.id, clientId: q.client_id, services: q.services || {},
    total: parseFloat(q.total) || 0, notes: q.notes, status: q.status,
    createdAt: q.created_at, updatedAt: q.updated_at,
  }));

  state.inspections = (inspectionsRes.data || []).map(i => ({
    id: i.id, clientId: i.client_id, unit: i.unit, notes: i.notes,
    rating: i.rating, results: i.results || {},
    createdAt: i.created_at, updatedAt: i.updated_at,
  }));

  state.actionPlans = (plansRes.data || []).map(p => ({
    id: p.id, clientId: p.client_id, inspectionId: p.inspection_id,
    inspectionType: p.inspection_type || 'food_truck', items: p.items || [],
    status: p.status, createdAt: p.created_at, updatedAt: p.updated_at,
  }));

  // Filter for client users — only show their own data
  if (!isAdmin() && state.profile && state.profile.clientId) {
    const cid = state.profile.clientId;
    state.clients = state.clients.filter(c => c.id === cid);
    state.quotes = state.quotes.filter(q => q.clientId === cid);
    state.inspections = state.inspections.filter(i => i.clientId === cid);
    state.actionPlans = state.actionPlans.filter(p => p.clientId === cid);
  }
}

async function upsertClient(client) {
  const { error } = await db.from('clients').upsert({
    id: client.id, name: client.name, biz: client.biz, phone: client.phone,
    email: client.email, type: client.type, status: client.status,
    notes: client.notes, created_at: client.createdAt, updated_at: client.updatedAt,
  });
  if (error) { console.error('Client save error:', error); toast('Save failed — check console'); }
}

async function upsertQuote(quote) {
  const { error } = await db.from('quotes').upsert({
    id: quote.id, client_id: quote.clientId, services: quote.services,
    total: quote.total, notes: quote.notes, status: quote.status,
    created_at: quote.createdAt, updated_at: quote.updatedAt,
  });
  if (error) { console.error('Quote save error:', error); toast('Save failed — check console'); }
}

async function upsertInspection(inspection) {
  const { error } = await db.from('inspections').upsert({
    id: inspection.id, client_id: inspection.clientId, unit: inspection.unit,
    notes: inspection.notes, rating: inspection.rating, results: inspection.results,
    created_at: inspection.createdAt, updated_at: inspection.updatedAt,
  });
  if (error) { console.error('Inspection save error:', error); toast('Save failed — check console'); }
}

// ===========================
// INSPECTION CHECKLIST TEMPLATE
// ===========================

// ===========================
// MULTI-INDUSTRY INSPECTION CHECKLISTS
// ===========================

const INSPECTION_TEMPLATES = {

  food_truck: {
    label: 'Food Truck / Trailer',
    sections: [
      { section: 'Exterior & Structure', items: [
        'Exterior condition (dents, rust, damage)', 'Doors seal properly', 'Windows / screens intact',
        'Awning condition (if applicable)', 'Signage / wrap condition', 'Tires condition & inflation',
        'Hitch / coupler condition', 'Lights (brake, turn, running)', 'Steps / access condition',
        'Propane tank storage & mounting',
      ]},
      { section: 'Electrical', items: [
        'Shore power connection / cord condition', 'Generator condition & operation',
        'Internal wiring visible condition', 'Outlets functional', 'Interior lighting functional',
        'Breaker panel condition & labeled',
      ]},
      { section: 'Plumbing & Water', items: [
        'Fresh water tank condition', 'Grey water tank condition', 'Water pump operational',
        'Hand wash sink present & functional', '3-compartment sink present', 'Hot water available',
        'No visible leaks', 'Water pressure adequate',
      ]},
      { section: 'Cooking Equipment', items: [
        'Fryer condition (if applicable)', 'Flat top / griddle condition', 'Burners / range condition',
        'Oven condition (if applicable)', 'Equipment securely mounted', 'Grease traps present & accessible',
      ]},
      { section: 'Ventilation & Hood', items: [
        'Hood type (Type I / Type II)', 'Hood filters condition', 'Exhaust fan operational',
        'Make-up air adequate', 'Grease buildup level',
      ]},
      { section: 'Refrigeration', items: [
        'Reach-in cooler condition', 'Reach-in temps adequate (≤41°F)', 'Freezer condition (if applicable)',
        'All door seals intact', 'Thermometers present',
      ]},
      { section: 'Fire & Safety', items: [
        'Fire suppression system (tag & expiration)', 'Fire extinguishers present & tagged',
        'First aid kit present', 'Emergency shutoff accessible', 'No combustibles stored near heat sources',
      ]},
      { section: 'Health & Compliance', items: [
        'Health permit present & current', 'Business license visible', 'Food handler certs available',
        'Insurance docs available', 'Last health inspection date noted',
      ]},
    ],
  },

  restaurant: {
    label: 'Restaurant / Bar',
    sections: [
      { section: 'Front of House', items: [
        'Entrance / signage clean & visible', 'Host stand organized', 'Dining area clean & presentable',
        'Tables & chairs in good condition', 'Restrooms clean & stocked', 'Lighting appropriate for concept',
        'Music / ambiance set correctly', 'Menu boards / printed menus current', 'POS system operational',
        'Wait station stocked (napkins, utensils, condiments)',
      ]},
      { section: 'Back of House — Kitchen', items: [
        'Line organized and clean', 'Prep areas sanitized', 'Cutting boards color-coded / condition',
        'Cooking equipment operational', 'Flat top / grill condition', 'Fryer oil quality & temp',
        'Oven / range condition', 'Small wares adequate & organized', 'Ticket rail / KDS functional',
        'Floor mats clean / not slippery',
      ]},
      { section: 'Food Storage & Safety', items: [
        'Walk-in cooler temp (≤41°F)', 'Walk-in freezer temp (≤0°F)', 'FIFO rotation practiced',
        'All items labeled & dated', 'Raw proteins stored below ready-to-eat', 'Dry storage organized & off floor',
        'No expired product', 'Chemical storage separate from food', 'Thermometers calibrated & accessible',
      ]},
      { section: 'Sanitation', items: [
        '3-compartment sink set up correctly', 'Sanitizer solution at correct PPM', 'Hand wash sinks accessible & stocked',
        'Dish machine operational & at temp', 'Grease trap maintenance current', 'Pest control up to date',
        'Trash / recycling managed properly', 'Cleaning schedule posted & followed',
      ]},
      { section: 'Ventilation & Hood', items: [
        'Hood filters clean', 'Exhaust fan operational', 'Make-up air adequate',
        'Grease buildup level acceptable', 'Last hood cleaning date noted',
      ]},
      { section: 'Bar (if applicable)', items: [
        'Bar top clean & organized', 'Speed rail stocked', 'Ice machine clean / ice scoop stored properly',
        'Liquor license posted', 'Pour control consistent', 'Draft system clean & operational',
        'Glass washer functional', 'Garnish station fresh & covered',
      ]},
      { section: 'Fire & Safety', items: [
        'Fire suppression system tagged & current', 'Fire extinguishers present & tagged',
        'First aid kit accessible', 'Emergency exits clear & marked', 'Slip hazards addressed',
        'No combustibles near heat sources',
      ]},
      { section: 'Compliance & Documentation', items: [
        'Health permit current & posted', 'Business license visible', 'Food handler certifications on file',
        'Liquor license current (if applicable)', 'Insurance documentation available',
        'Last health inspection score posted', 'Employee emergency contacts on file',
      ]},
    ],
  },

  salon: {
    label: 'Salon / Barbershop',
    sections: [
      { section: 'Reception & Waiting Area', items: [
        'Entrance clean & inviting', 'Reception desk organized', 'Waiting area clean & comfortable',
        'Retail product display organized', 'Pricing visible / service menu available',
        'Booking system operational (digital or paper)', 'Music / ambiance appropriate',
      ]},
      { section: 'Stations & Equipment', items: [
        'Styling chairs in good condition', 'Mirrors clean & undamaged', 'Station surfaces clean between clients',
        'Tools organized & accessible', 'Electrical outlets functional (dryers, clippers, irons)',
        'Hydraulic chairs working properly', 'Shampoo bowls clean & draining',
        'Hot water available at all stations',
      ]},
      { section: 'Sanitation & Disinfection', items: [
        'Tools disinfected between clients (combs, brushes, clippers)', 'Barbicide / disinfectant solution fresh',
        'Capes / towels laundered between clients', 'Neck strips used (barbershop)',
        'Single-use items disposed properly (razors, gloves)', 'Work surfaces wiped & sanitized',
        'Floor swept between clients', 'Hand washing practiced between clients',
      ]},
      { section: 'Product & Inventory', items: [
        'Professional products organized & in-date', 'Retail products stocked & priced',
        'Color / chemical storage proper (ventilation, temp)', 'Backbar products adequate',
        'Inventory tracking system in place', 'Reorder process established',
      ]},
      { section: 'Licensing & Compliance', items: [
        'Cosmetology / barber license posted (each stylist)', 'Establishment license posted',
        'Business license current', 'Insurance documentation available',
        'State board inspection history available', 'OSHA / SDS sheets accessible for chemicals',
      ]},
      { section: 'Facility', items: [
        'Restrooms clean & stocked', 'HVAC / ventilation adequate (especially for chemicals)',
        'Lighting sufficient at each station', 'Fire extinguisher present & tagged',
        'Emergency exit clear & marked', 'ADA accessibility addressed',
        'Break room / staff area clean',
      ]},
      { section: 'Operations & Client Flow', items: [
        'Appointment system reliable (no-show rate tracked)', 'Check-in / check-out process smooth',
        'Payment systems working (cash, card, mobile)', 'Client records maintained (preferences, allergies)',
        'Cancellation / no-show policy communicated', 'Tips handled properly',
        'Staff scheduling system in place',
      ]},
    ],
  },

  digital_media: {
    label: 'Digital Media / Content Creator',
    sections: [
      { section: 'Brand & Identity', items: [
        'Brand guidelines documented (colors, fonts, voice)', 'Logo consistent across platforms',
        'Bio / about consistent across platforms', 'Profile photos current & professional',
        'Website / landing page live & functional', 'Contact info easy to find',
        'Brand voice consistent in content',
      ]},
      { section: 'Content Workflow', items: [
        'Content calendar exists & is followed', 'Posting frequency consistent',
        'Content batching practiced', 'Editing workflow defined', 'Asset storage organized (photos, video, graphics)',
        'Backup system for content & files', 'Templates exist for recurring content types',
      ]},
      { section: 'Platform Presence', items: [
        'Primary platform identified & prioritized', 'Instagram profile optimized (bio, highlights, link)',
        'TikTok presence (if relevant)', 'YouTube channel organized (playlists, descriptions)',
        'Facebook / LinkedIn presence (if B2B)', 'Google Business Profile set up (if local)',
        'Cross-posting strategy defined',
      ]},
      { section: 'Tech & Equipment', items: [
        'Camera / phone quality sufficient', 'Lighting setup adequate', 'Audio quality acceptable (mic, environment)',
        'Editing software current & functional', 'Graphic design tools in place (Canva, Adobe, etc.)',
        'Scheduling tool in use (Later, Buffer, etc.)', 'Analytics tools set up',
      ]},
      { section: 'Monetization', items: [
        'Revenue streams identified (ads, sponsors, products, services)', 'Media kit available for sponsors',
        'Rate sheet exists', 'Invoice / payment system in place', 'Contracts / agreements used for partnerships',
        'Affiliate links tracked', 'Products / services priced correctly',
      ]},
      { section: 'Analytics & Growth', items: [
        'Key metrics tracked (followers, engagement, reach)', 'Analytics reviewed regularly (weekly/monthly)',
        'Top-performing content identified', 'Audience demographics understood',
        'Growth strategy documented', 'Email list / newsletter active', 'Conversion funnel defined',
      ]},
      { section: 'Legal & Business', items: [
        'Business entity formed (LLC, etc.)', 'EIN obtained', 'Business bank account separate from personal',
        'Bookkeeping system in place', 'Contracts used for client work / sponsorships',
        'FTC disclosure compliance (sponsored content)', 'Copyright / trademark protections in place',
      ]},
    ],
  },

  retail: {
    label: 'Retail / E-commerce',
    sections: [
      { section: 'Storefront & First Impression', items: [
        'Exterior signage visible & clean', 'Window displays current & appealing',
        'Entrance clean & welcoming', 'Store layout logical & easy to navigate',
        'Lighting appropriate for merchandise', 'Music / scent / ambiance intentional',
      ]},
      { section: 'Merchandising & Display', items: [
        'Products organized by category / collection', 'Price tags on all items',
        'Featured / promotional items highlighted', 'Fixtures & shelving in good condition',
        'Stock levels adequate (no empty shelves)', 'Seasonal displays current',
        'Impulse buy zone near register',
      ]},
      { section: 'Inventory Management', items: [
        'Inventory system in place (POS-linked or standalone)', 'Physical inventory count scheduled',
        'Reorder points established for key items', 'Vendor relationships documented',
        'Receiving process defined', 'Shrinkage / loss tracked', 'Dead stock identified & addressed',
      ]},
      { section: 'Point of Sale & Payment', items: [
        'POS system operational', 'Card reader functional (chip, tap, swipe)',
        'Receipt printer / email receipts working', 'Cash handling procedures defined',
        'End-of-day reconciliation process', 'Return / exchange policy posted',
        'Gift cards / loyalty program (if applicable)',
      ]},
      { section: 'E-commerce (if applicable)', items: [
        'Website live & functional', 'Product photos high quality', 'Product descriptions complete',
        'Shopping cart & checkout working', 'Payment processing set up', 'Shipping rates & policies defined',
        'Order fulfillment process defined', 'Inventory synced between online & physical',
      ]},
      { section: 'Staff & Operations', items: [
        'Staff trained on product knowledge', 'Customer greeting / service standard defined',
        'Opening / closing checklists exist', 'Staff scheduling system in place',
        'Employee handbook / policies documented', 'Cash handling training completed',
      ]},
      { section: 'Compliance & Safety', items: [
        'Business license current & posted', 'Sales tax collection set up',
        'Insurance documentation available', 'Fire extinguisher present & tagged',
        'Emergency exits clear & marked', 'Security system / cameras operational',
        'ADA accessibility addressed',
      ]},
    ],
  },

};

// Default to food_truck for backward compatibility
const INSPECTION_CHECKLIST = INSPECTION_TEMPLATES.food_truck.sections;

// ===========================
// INIT
// ===========================

async function init() {
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
  buildInspectionChecklist();
  refreshServiceDetails();
  await checkAuth();
}

function renderAll() {
  renderDashboard();
  renderClients();
  renderQuotes();
  renderInspections();
  renderPlans();
  populateClientDropdowns();
}

// ===========================
// NAVIGATION
// ===========================

function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + screen).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${screen}"]`).classList.add('active');
}

// ===========================
// DASHBOARD
// ===========================

function renderDashboard() {
  const activeClients = state.clients.filter(c => c.status === 'active' || c.status === 'retainer').length;
  const retainers = state.clients.filter(c => c.status === 'retainer').length;
  const quotesSent = state.quotes.filter(q => q.status !== 'draft').length;

  let totalBilled = 0;
  state.quotes.filter(q => q.status === 'accepted').forEach(q => { totalBilled += q.total || 0; });

  document.getElementById('statActiveClients').textContent = activeClients;
  document.getElementById('statRetainers').textContent = retainers;
  document.getElementById('statQuotesSent').textContent = quotesSent;
  document.getElementById('statRevenue').textContent = '$' + totalBilled.toLocaleString();

  const events = [];
  state.clients.forEach(c => events.push({ type: 'Client', desc: c.name + (c.biz ? ' — ' + c.biz : ''), date: c.createdAt }));
  state.quotes.forEach(q => {
    const client = state.clients.find(c => c.id === q.clientId);
    events.push({ type: 'Quote', desc: (client ? client.name : 'Unknown') + ' — $' + (q.total || 0).toFixed(0), date: q.createdAt });
  });
  state.inspections.forEach(i => {
    const client = state.clients.find(c => c.id === i.clientId);
    events.push({ type: 'Inspection', desc: (client ? client.name : 'Unknown') + (i.unit ? ' — ' + i.unit : ''), date: i.createdAt });
  });

  events.sort((a, b) => (b.date || 0) - (a.date || 0));
  const recent = events.slice(0, 8);

  const el = document.getElementById('recentActivity');
  if (recent.length === 0) {
    el.innerHTML = '<div class="empty-state">No activity yet — let\'s get to work.</div>';
    return;
  }

  el.innerHTML = recent.map(e => `
    <div class="activity-item">
      <div class="activity-type">${e.type}</div>
      <div class="activity-desc">${e.desc}</div>
      <div class="activity-date">${formatDate(e.date)}</div>
    </div>
  `).join('');
}

// ===========================
// CLIENTS
// ===========================

function renderClients() {
  const search = (document.getElementById('clientSearch')?.value || '').toLowerCase();
  let filtered = state.clients;

  if (state.activeClientFilter !== 'all') {
    filtered = filtered.filter(c => c.status === state.activeClientFilter);
  }

  if (search) {
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(search) ||
      (c.biz || '').toLowerCase().includes(search)
    );
  }

  const el = document.getElementById('clientList');

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state">No clients found.</div>';
    return;
  }

  el.innerHTML = filtered.map(c => `
    <div class="client-card" onclick="viewClient('${c.id}')">
      <div class="client-avatar">${initials(c.name)}</div>
      <div class="client-info">
        <div class="client-name">${c.name}</div>
        <div class="client-biz">${c.biz || typeLabel(c.type)}</div>
      </div>
      <div class="client-meta">
        <span class="status-badge status-${c.status}">${c.status}</span>
      </div>
    </div>
  `).join('');
}

function filterClients() { renderClients(); }

function setClientFilter(filter, btn) {
  state.activeClientFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderClients();
}

function openAddClient(prefill = {}) {
  document.getElementById('clientModalTitle').textContent = 'New Client';
  document.getElementById('clientId').value = '';
  document.getElementById('clientName').value = prefill.name || '';
  document.getElementById('clientBiz').value = '';
  document.getElementById('clientPhone').value = '';
  document.getElementById('clientEmail').value = '';
  document.getElementById('clientType').value = 'food_truck';
  document.getElementById('clientStatus').value = 'prospect';
  document.getElementById('clientNotes').value = '';
  openModal('modal-client');
}

async function saveClient() {
  const name = document.getElementById('clientName').value.trim();
  if (!name) { toast('Name is required'); return; }

  const id = document.getElementById('clientId').value || uid();
  const existing = state.clients.find(c => c.id === id);

  const client = {
    id,
    name,
    biz: document.getElementById('clientBiz').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    email: document.getElementById('clientEmail').value.trim(),
    type: document.getElementById('clientType').value,
    status: document.getElementById('clientStatus').value,
    notes: document.getElementById('clientNotes').value.trim(),
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (existing) {
    state.clients = state.clients.map(c => c.id === id ? client : c);
  } else {
    state.clients.push(client);
  }

  renderAll();
  closeModal('modal-client');
  toast(existing ? 'Client updated' : 'Client saved');
  await upsertClient(client);
}

function viewClient(id) {
  const c = state.clients.find(c => c.id === id);
  if (!c) return;
  state.viewingClientId = id;

  document.getElementById('viewClientName').textContent = c.name;
  document.getElementById('viewClientBody').innerHTML = `
    <div class="view-detail">
      <div class="view-detail-label">Business</div>
      <div class="view-detail-value">${c.biz || '—'}</div>
    </div>
    <div class="view-detail">
      <div class="view-detail-label">Type</div>
      <div class="view-detail-value">${typeLabel(c.type)}</div>
    </div>
    <div class="view-detail">
      <div class="view-detail-label">Status</div>
      <div class="view-detail-value"><span class="status-badge status-${c.status}">${c.status}</span></div>
    </div>
    <div class="view-detail">
      <div class="view-detail-label">Phone</div>
      <div class="view-detail-value">${c.phone ? `<a href="tel:${c.phone}" style="color:var(--accent)">${c.phone}</a>` : '—'}</div>
    </div>
    <div class="view-detail">
      <div class="view-detail-label">Email</div>
      <div class="view-detail-value">${c.email ? `<a href="mailto:${c.email}" style="color:var(--accent)">${c.email}</a>` : '—'}</div>
    </div>
    ${c.notes ? `<div class="view-detail">
      <div class="view-detail-label">Notes</div>
      <div class="view-notes">${c.notes}</div>
    </div>` : ''}
  `;
  openModal('modal-client-view');
}

function editClientFromView() {
  const c = state.clients.find(c => c.id === state.viewingClientId);
  if (!c) return;
  closeModal('modal-client-view');

  document.getElementById('clientModalTitle').textContent = 'Edit Client';
  document.getElementById('clientId').value = c.id;
  document.getElementById('clientName').value = c.name;
  document.getElementById('clientBiz').value = c.biz || '';
  document.getElementById('clientPhone').value = c.phone || '';
  document.getElementById('clientEmail').value = c.email || '';
  document.getElementById('clientType').value = c.type;
  document.getElementById('clientStatus').value = c.status;
  document.getElementById('clientNotes').value = c.notes || '';
  openModal('modal-client');
}

function newQuoteForClient() {
  state.pendingClientForQuote = state.viewingClientId;
  closeModal('modal-client-view');
  navigate('quotes');
  openNewQuote();
}

function newInspectionForClient() {
  state.pendingClientForInspection = state.viewingClientId;
  closeModal('modal-client-view');
  navigate('inspections');
  openNewInspection();
}

// ===========================
// QUOTES
// ===========================

function renderQuotes() {
  const el = document.getElementById('quoteList');

  if (state.quotes.length === 0) {
    el.innerHTML = '<div class="empty-state">No quotes yet.</div>';
    return;
  }

  const sorted = [...state.quotes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  el.innerHTML = sorted.map(q => {
    const client = state.clients.find(c => c.id === q.clientId);
    const statusColors = {
      draft: 'status-prospect',
      sent: 'status-active',
      accepted: 'status-retainer',
      declined: 'status-completed',
    };
    return `
      <div class="quote-card" onclick="openEditQuote('${q.id}')">
        <div class="card-top">
          <div class="card-client">${client ? client.name : 'Unknown'}</div>
          <div class="card-amount">$${(q.total || 0).toFixed(0)}</div>
        </div>
        <div class="card-meta">
          <span class="status-badge ${statusColors[q.status] || 'status-prospect'}">${q.status}</span>
          <span style="margin-left:8px">${formatDate(q.createdAt)}</span>
          ${q.notes ? ` · ${q.notes.slice(0, 40)}...` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openNewQuote() {
  document.getElementById('quoteModalTitle').textContent = 'New Quote';
  document.getElementById('quoteId').value = '';
  document.getElementById('quoteNotes').value = '';
  document.getElementById('quoteStatus').value = 'draft';

  ['svcInspection', 'svcSession', 'svcStarterPkg', 'svcFullBuild', 'svcRetainer', 'svcTravel']
    .forEach(id => { document.getElementById(id).checked = false; });
  document.getElementById('svcSessionHrs').value = 1;
  document.getElementById('svcRetainerMos').value = 1;
  document.getElementById('svcTravelMiles').value = 30;
  document.getElementById('svcStarterPkgAmt').value = 500;
  document.getElementById('svcFullBuildAmt').value = 1000;

  populateClientDropdowns();
  if (state.pendingClientForQuote) {
    document.getElementById('quoteClient').value = state.pendingClientForQuote;
    state.pendingClientForQuote = null;
  }

  refreshServiceDetails();
  recalcQuote();
  openModal('modal-quote');
}

function openEditQuote(id) {
  const q = state.quotes.find(q => q.id === id);
  if (!q) return;

  document.getElementById('quoteModalTitle').textContent = 'Edit Quote';
  document.getElementById('quoteId').value = q.id;
  document.getElementById('quoteNotes').value = q.notes || '';
  document.getElementById('quoteStatus').value = q.status || 'draft';

  populateClientDropdowns();
  document.getElementById('quoteClient').value = q.clientId || '';

  const s = q.services || {};
  document.getElementById('svcInspection').checked = !!s.inspection;
  document.getElementById('svcSession').checked = !!s.session;
  document.getElementById('svcSessionHrs').value = s.sessionHrs || 1;
  document.getElementById('svcStarterPkg').checked = !!s.starterPkg;
  document.getElementById('svcStarterPkgAmt').value = s.starterPkgAmt || 500;
  document.getElementById('svcFullBuild').checked = !!s.fullBuild;
  document.getElementById('svcFullBuildAmt').value = s.fullBuildAmt || 1000;
  document.getElementById('svcRetainer').checked = !!s.retainer;
  document.getElementById('svcRetainerMos').value = s.retainerMos || 1;
  document.getElementById('svcTravel').checked = !!s.travel;
  document.getElementById('svcTravelMiles').value = s.travelMiles || 30;

  refreshServiceDetails();
  recalcQuote();
  openModal('modal-quote');
}

function recalcQuote() {
  refreshServiceDetails();
  let total = 0;

  if (document.getElementById('svcInspection').checked) total += 300;
  if (document.getElementById('svcSession').checked) {
    total += 85 * (parseInt(document.getElementById('svcSessionHrs').value) || 1);
  }
  if (document.getElementById('svcStarterPkg').checked) {
    total += parseInt(document.getElementById('svcStarterPkgAmt').value) || 500;
  }
  if (document.getElementById('svcFullBuild').checked) {
    total += parseInt(document.getElementById('svcFullBuildAmt').value) || 1000;
  }
  if (document.getElementById('svcRetainer').checked) {
    total += 250 * (parseInt(document.getElementById('svcRetainerMos').value) || 1);
  }
  if (document.getElementById('svcTravel').checked) {
    const miles = parseInt(document.getElementById('svcTravelMiles').value) || 0;
    total += Math.round(miles * 0.67 * 100) / 100;
  }

  const deposit = total * 0.5;
  document.getElementById('quoteSubtotal').textContent = '$' + total.toFixed(2);
  document.getElementById('quoteDeposit').textContent = '$' + deposit.toFixed(2);
  document.getElementById('quoteBalance').textContent = '$' + deposit.toFixed(2);
}

function refreshServiceDetails() {
  const pairs = [
    ['svcSession', 'svcSessionDetail'],
    ['svcStarterPkg', 'svcStarterPkgDetail'],
    ['svcFullBuild', 'svcFullBuildDetail'],
    ['svcRetainer', 'svcRetainerDetail'],
    ['svcTravel', 'svcTravelDetail'],
  ];
  pairs.forEach(([cb, detail]) => {
    const checked = document.getElementById(cb)?.checked;
    const detailEl = document.getElementById(detail);
    if (detailEl) detailEl.style.display = checked ? 'flex' : 'none';
  });
}

async function saveQuote() {
  const clientId = document.getElementById('quoteClient').value;
  if (!clientId) { toast('Select a client'); return; }

  const services = {
    inspection: document.getElementById('svcInspection').checked,
    session: document.getElementById('svcSession').checked,
    sessionHrs: parseInt(document.getElementById('svcSessionHrs').value) || 1,
    starterPkg: document.getElementById('svcStarterPkg').checked,
    starterPkgAmt: parseInt(document.getElementById('svcStarterPkgAmt').value) || 500,
    fullBuild: document.getElementById('svcFullBuild').checked,
    fullBuildAmt: parseInt(document.getElementById('svcFullBuildAmt').value) || 1000,
    retainer: document.getElementById('svcRetainer').checked,
    retainerMos: parseInt(document.getElementById('svcRetainerMos').value) || 1,
    travel: document.getElementById('svcTravel').checked,
    travelMiles: parseInt(document.getElementById('svcTravelMiles').value) || 0,
  };

  let total = 0;
  if (services.inspection) total += 300;
  if (services.session) total += 85 * services.sessionHrs;
  if (services.starterPkg) total += services.starterPkgAmt;
  if (services.fullBuild) total += services.fullBuildAmt;
  if (services.retainer) total += 250 * services.retainerMos;
  if (services.travel) total += Math.round(services.travelMiles * 0.67 * 100) / 100;

  const id = document.getElementById('quoteId').value || uid();
  const existing = state.quotes.find(q => q.id === id);

  const quote = {
    id,
    clientId,
    services,
    total,
    notes: document.getElementById('quoteNotes').value.trim(),
    status: document.getElementById('quoteStatus').value,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (existing) {
    state.quotes = state.quotes.map(q => q.id === id ? quote : q);
  } else {
    state.quotes.push(quote);
  }

  renderAll();
  closeModal('modal-quote');
  toast(existing ? 'Quote updated' : 'Quote saved');
  await upsertQuote(quote);
}

function copyQuoteToClipboard() {
  const clientId = document.getElementById('quoteClient').value;
  const client = state.clients.find(c => c.id === clientId);
  const total = parseFloat(document.getElementById('quoteSubtotal').textContent.replace('$', '')) || 0;
  const deposit = (total * 0.5).toFixed(2);
  const notes = document.getElementById('quoteNotes').value.trim();

  const lines = ['ON THE LINE CONSULTING', 'Chris Petteys | (656) 217-0375', ''];
  if (client) lines.push(`Client: ${client.name}${client.biz ? ' — ' + client.biz : ''}`, '');
  lines.push('SERVICES:', '');

  if (document.getElementById('svcInspection').checked)
    lines.push('  • Truck / Trailer Inspection .............. $300.00');
  if (document.getElementById('svcSession').checked) {
    const hrs = document.getElementById('svcSessionHrs').value;
    lines.push(`  • Consulting Session (${hrs} hr${hrs > 1 ? 's' : ''}) ........... $${(85 * parseInt(hrs)).toFixed(2)}`);
  }
  if (document.getElementById('svcStarterPkg').checked)
    lines.push(`  • Starter Operations Package .............. $${parseInt(document.getElementById('svcStarterPkgAmt').value).toFixed(2)}`);
  if (document.getElementById('svcFullBuild').checked)
    lines.push(`  • Full System Build ....................... $${parseInt(document.getElementById('svcFullBuildAmt').value).toFixed(2)}`);
  if (document.getElementById('svcRetainer').checked) {
    const mos = document.getElementById('svcRetainerMos').value;
    lines.push(`  • Monthly Retainer (${mos} mo) .............. $${(250 * parseInt(mos)).toFixed(2)}`);
  }
  if (document.getElementById('svcTravel').checked) {
    const mi = document.getElementById('svcTravelMiles').value;
    lines.push(`  • Travel (${mi} mi @ $0.67) ................. $${(parseFloat(mi) * 0.67).toFixed(2)}`);
  }

  lines.push('');
  lines.push(`TOTAL: $${total.toFixed(2)}`);
  lines.push(`Deposit Due (50%): $${deposit}`);
  lines.push(`Balance on Delivery: $${deposit}`);
  lines.push('');
  lines.push('Payment: Check, Zelle, Venmo, Cash');
  lines.push('Late payments (15+ days): 5%/month');
  if (notes) { lines.push(''); lines.push('Notes: ' + notes); }

  navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Quote copied!')).catch(() => toast('Copy failed'));
}

// ===========================
// INSPECTIONS
// ===========================

let activeInspectionTemplate = 'food_truck';

function switchInspectionTemplate() {
  activeInspectionTemplate = document.getElementById('inspectionType').value;
  buildInspectionChecklist();
}

function getActiveChecklist() {
  return (INSPECTION_TEMPLATES[activeInspectionTemplate] || INSPECTION_TEMPLATES.food_truck).sections;
}

function buildInspectionChecklist() {
  const checklist = getActiveChecklist();
  const container = document.getElementById('inspectionChecklist');
  container.innerHTML = checklist.map((section, si) => `
    <div class="checklist-section">
      <div class="checklist-section-title">${section.section}</div>
      ${section.items.map((item, ii) => {
        const key = `s${si}i${ii}`;
        return `
          <div class="checklist-item">
            <div class="checklist-item-label">${item}</div>
            <div class="checklist-toggle">
              <button class="toggle-btn" data-key="${key}" data-val="pass" onclick="setInspectionItem('${key}', 'pass', this)">Pass</button>
              <button class="toggle-btn" data-key="${key}" data-val="attention" onclick="setInspectionItem('${key}', 'attention', this)">Attention</button>
              <button class="toggle-btn" data-key="${key}" data-val="fail" onclick="setInspectionItem('${key}', 'fail', this)">Fail</button>
              <button class="toggle-btn selected-na" data-key="${key}" data-val="na" onclick="setInspectionItem('${key}', 'na', this)">N/A</button>
            </div>
            <div class="item-note">
              <input type="text" id="note_${key}" placeholder="Note..." />
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function setInspectionItem(key, val, btn) {
  const classMap = { pass: 'selected-pass', attention: 'selected-attention', fail: 'selected-fail', na: 'selected-na' };
  document.querySelectorAll(`[data-key="${key}"]`).forEach(b => {
    Object.values(classMap).forEach(c => b.classList.remove(c));
  });
  btn.classList.add(classMap[val]);
}

function getInspectionResults() {
  const results = { _template: activeInspectionTemplate };
  const checklist = getActiveChecklist();
  checklist.forEach((section, si) => {
    section.items.forEach((item, ii) => {
      const key = `s${si}i${ii}`;
      const selected = document.querySelector(`[data-key="${key}"].selected-pass, [data-key="${key}"].selected-attention, [data-key="${key}"].selected-fail, [data-key="${key}"].selected-na`);
      const note = document.getElementById(`note_${key}`)?.value.trim() || '';
      results[key] = {
        section: section.section,
        item,
        result: selected ? selected.dataset.val : 'na',
        note,
      };
    });
  });
  return results;
}

function resetInspectionChecklist() {
  const checklist = getActiveChecklist();
  checklist.forEach((section, si) => {
    section.items.forEach((_, ii) => {
      const key = `s${si}i${ii}`;
      document.querySelectorAll(`[data-key="${key}"]`).forEach(b => {
        b.classList.remove('selected-pass', 'selected-attention', 'selected-fail', 'selected-na');
      });
      document.querySelector(`[data-key="${key}"][data-val="na"]`)?.classList.add('selected-na');
      const noteInput = document.getElementById(`note_${key}`);
      if (noteInput) noteInput.value = '';
    });
  });
}

function loadInspectionResults(results) {
  if (!results) return;
  const classMap = { pass: 'selected-pass', attention: 'selected-attention', fail: 'selected-fail', na: 'selected-na' };
  Object.entries(results).forEach(([key, data]) => {
    document.querySelectorAll(`[data-key="${key}"]`).forEach(b => {
      Object.values(classMap).forEach(c => b.classList.remove(c));
    });
    const btn = document.querySelector(`[data-key="${key}"][data-val="${data.result}"]`);
    if (btn) btn.classList.add(classMap[data.result]);
    const noteInput = document.getElementById(`note_${key}`);
    if (noteInput) noteInput.value = data.note || '';
  });
}

function renderInspections() {
  const el = document.getElementById('inspectionList');

  if (state.inspections.length === 0) {
    el.innerHTML = '<div class="empty-state">No inspections yet.</div>';
    return;
  }

  const sorted = [...state.inspections].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  el.innerHTML = sorted.map(i => {
    const client = state.clients.find(c => c.id === i.clientId);
    const tmpl = (i.results && i.results._template) ? INSPECTION_TEMPLATES[i.results._template] : null;
    const tmplLabel = tmpl ? tmpl.label : 'Food Truck / Trailer';
    return `
      <div class="inspection-card" onclick="openEditInspection('${i.id}')">
        <div class="card-top">
          <div class="card-client">${client ? client.name : 'Unknown'}</div>
          <span class="rating-badge rating-${i.rating}">${i.rating}</span>
        </div>
        <div class="card-meta">
          ${tmplLabel} · ${i.unit || 'No unit specified'} · ${formatDate(i.createdAt)}
        </div>
      </div>
    `;
  }).join('');
}

function openNewInspection() {
  document.getElementById('inspectionId').value = '';
  document.getElementById('inspectionUnit').value = '';
  document.getElementById('inspectionNotes').value = '';
  document.getElementById('inspectionRating').value = 'pass';

  populateClientDropdowns();

  // Auto-select template based on client type
  let templateKey = 'food_truck';
  if (state.pendingClientForInspection) {
    document.getElementById('inspectionClient').value = state.pendingClientForInspection;
    const client = state.clients.find(c => c.id === state.pendingClientForInspection);
    if (client) {
      const typeMap = { food_truck: 'food_truck', trailer: 'food_truck', brick_mortar: 'restaurant',
        salon: 'salon', digital_media: 'digital_media', retail: 'retail', freelancer: 'digital_media' };
      templateKey = typeMap[client.type] || 'food_truck';
    }
    state.pendingClientForInspection = null;
  }

  activeInspectionTemplate = templateKey;
  document.getElementById('inspectionType').value = templateKey;
  buildInspectionChecklist();
  openModal('modal-inspection');
}

function openEditInspection(id) {
  const inspection = state.inspections.find(i => i.id === id);
  if (!inspection) return;

  document.getElementById('inspectionId').value = inspection.id;
  document.getElementById('inspectionUnit').value = inspection.unit || '';
  document.getElementById('inspectionNotes').value = inspection.notes || '';
  document.getElementById('inspectionRating').value = inspection.rating || 'pass';

  populateClientDropdowns();
  document.getElementById('inspectionClient').value = inspection.clientId || '';

  // Restore the template used for this inspection
  const savedTemplate = (inspection.results && inspection.results._template) || 'food_truck';
  activeInspectionTemplate = savedTemplate;
  document.getElementById('inspectionType').value = savedTemplate;
  buildInspectionChecklist();
  loadInspectionResults(inspection.results);
  openModal('modal-inspection');
}

async function saveInspection() {
  const clientId = document.getElementById('inspectionClient').value;
  if (!clientId) { toast('Select a client'); return; }

  const id = document.getElementById('inspectionId').value || uid();
  const existing = state.inspections.find(i => i.id === id);

  const inspection = {
    id,
    clientId,
    unit: document.getElementById('inspectionUnit').value.trim(),
    notes: document.getElementById('inspectionNotes').value.trim(),
    rating: document.getElementById('inspectionRating').value,
    results: getInspectionResults(),
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (existing) {
    state.inspections = state.inspections.map(i => i.id === id ? inspection : i);
  } else {
    state.inspections.push(inspection);
  }

  renderAll();
  closeModal('modal-inspection');
  toast(existing ? 'Inspection updated' : 'Inspection saved');
  await upsertInspection(inspection);
}

function copyInspectionReport() {
  const clientId = document.getElementById('inspectionClient').value;
  const client = state.clients.find(c => c.id === clientId);
  const unit = document.getElementById('inspectionUnit').value.trim();
  const notes = document.getElementById('inspectionNotes').value.trim();
  const rating = document.getElementById('inspectionRating').value.toUpperCase();
  const results = getInspectionResults();

  const tmpl = INSPECTION_TEMPLATES[activeInspectionTemplate] || INSPECTION_TEMPLATES.food_truck;
  const lines = [
    'ON THE LINE CONSULTING',
    `${tmpl.label.toUpperCase()} INSPECTION REPORT`,
    `Date: ${new Date().toLocaleDateString()}`,
    `Inspector: Chris Petteys | (656) 217-0375`,
    '',
  ];

  if (client) lines.push(`Client: ${client.name}${client.biz ? ' — ' + client.biz : ''}`);
  if (unit) lines.push(`Unit: ${unit}`);
  lines.push('');

  let currentSection = '';
  Object.values(results).forEach(r => {
    if (r.section !== currentSection) {
      currentSection = r.section;
      lines.push('— ' + r.section.toUpperCase() + ' —');
    }
    const symbol = r.result === 'pass' ? '✓' : r.result === 'attention' ? '⚠' : r.result === 'fail' ? '✗' : '—';
    lines.push(`  ${symbol} ${r.item}${r.note ? ' — ' + r.note : ''}`);
  });

  lines.push('');
  lines.push(`OVERALL RATING: ${rating}`);
  if (notes) { lines.push(''); lines.push('NOTES & RECOMMENDATIONS:'); lines.push(notes); }
  lines.push('');
  lines.push('On The Line Consulting | onthelineconsulting.com');

  navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Report copied!')).catch(() => toast('Copy failed'));
}

// ===========================
// ACTION PLANS
// ===========================

async function saveAndGeneratePlan() {
  const clientId = document.getElementById('inspectionClient').value;
  if (!clientId) { toast('Select a client'); return; }

  // Save the inspection first
  await saveInspection();

  // Find the inspection we just saved
  const inspection = state.inspections.find(i => i.clientId === clientId);
  if (!inspection) { toast('Save failed'); return; }

  generateActionPlan(inspection);
}

function generateActionPlan(inspection) {
  const results = inspection.results || {};
  const template = results._template || 'food_truck';
  const tmpl = INSPECTION_TEMPLATES[template] || INSPECTION_TEMPLATES.food_truck;

  // Pull fails and attention items
  const planItems = [];
  Object.entries(results).forEach(([key, data]) => {
    if (key === '_template') return;
    if (data.result === 'fail') {
      planItems.push({
        id: key,
        section: data.section,
        item: data.item,
        note: data.note || '',
        priority: 'critical',
        done: false,
      });
    } else if (data.result === 'attention') {
      planItems.push({
        id: key,
        section: data.section,
        item: data.item,
        note: data.note || '',
        priority: 'attention',
        done: false,
      });
    }
  });

  // Sort: critical first, then attention
  planItems.sort((a, b) => {
    if (a.priority === 'critical' && b.priority !== 'critical') return -1;
    if (a.priority !== 'critical' && b.priority === 'critical') return 1;
    return 0;
  });

  const client = state.clients.find(c => c.id === inspection.clientId);
  const plan = {
    id: 'plan_' + uid(),
    clientId: inspection.clientId,
    inspectionId: inspection.id,
    inspectionType: template,
    items: planItems,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.actionPlans.push(plan);
  renderPlans();
  upsertActionPlan(plan);

  // Open the plan
  viewActionPlan(plan.id);
  toast(`Action plan: ${planItems.length} items`);
}

function viewActionPlan(planId) {
  const plan = state.actionPlans.find(p => p.id === planId);
  if (!plan) return;
  state.viewingPlanId = planId;

  const client = state.clients.find(c => c.id === plan.clientId);
  const tmpl = INSPECTION_TEMPLATES[plan.inspectionType] || INSPECTION_TEMPLATES.food_truck;

  document.getElementById('planModalTitle').textContent =
    `Action Plan — ${client ? client.name : 'Unknown'}`;

  const critical = plan.items.filter(i => i.priority === 'critical');
  const attention = plan.items.filter(i => i.priority === 'attention');
  const doneCount = plan.items.filter(i => i.done).length;
  const totalCount = plan.items.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  let html = `
    <div class="plan-progress">
      <div class="plan-progress-bar">
        <div class="plan-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="plan-progress-label">${doneCount} / ${totalCount} complete (${pct}%)</div>
    </div>
    <div class="plan-type-label">${tmpl.label} Inspection</div>
  `;

  if (critical.length > 0) {
    html += `<h4 class="plan-section-title plan-critical">CRITICAL — Must Fix</h4>`;
    html += critical.map((item, i) => planItemHTML(item, i, 'critical')).join('');
  }

  if (attention.length > 0) {
    html += `<h4 class="plan-section-title plan-attention">ATTENTION — Should Address</h4>`;
    html += attention.map((item, i) => planItemHTML(item, i + critical.length, 'attention')).join('');
  }

  if (totalCount === 0) {
    html += `<div class="empty-state">Everything passed! No action items needed.</div>`;
  }

  document.getElementById('planModalBody').innerHTML = html;
  openModal('modal-plan');
}

function planItemHTML(item, index, priority) {
  const checkedAttr = item.done ? 'checked' : '';
  const doneClass = item.done ? 'plan-item-done' : '';
  return `
    <div class="plan-item ${doneClass}" id="plan-item-${index}">
      <label class="plan-check">
        <input type="checkbox" ${checkedAttr} onchange="togglePlanItem(${index}, this.checked)" />
        <div class="plan-item-content">
          <div class="plan-item-section">${item.section}</div>
          <div class="plan-item-label">${item.item}</div>
          ${item.note ? `<div class="plan-item-note">${item.note}</div>` : ''}
        </div>
      </label>
    </div>
  `;
}

function togglePlanItem(index, checked) {
  const plan = state.actionPlans.find(p => p.id === state.viewingPlanId);
  if (!plan) return;
  plan.items[index].done = checked;
  plan.updatedAt = Date.now();

  // Re-render to update progress bar
  viewActionPlan(plan.id);
}

async function saveActionPlan() {
  const plan = state.actionPlans.find(p => p.id === state.viewingPlanId);
  if (!plan) return;
  plan.updatedAt = Date.now();

  // Check if all done
  const allDone = plan.items.every(i => i.done);
  if (allDone && plan.items.length > 0) plan.status = 'completed';

  await upsertActionPlan(plan);
  renderPlans();
  renderDashboard();
  closeModal('modal-plan');
  toast(allDone ? 'Plan completed!' : 'Progress saved');
}

function copyActionPlan() {
  const plan = state.actionPlans.find(p => p.id === state.viewingPlanId);
  if (!plan) return;
  const client = state.clients.find(c => c.id === plan.clientId);
  const tmpl = INSPECTION_TEMPLATES[plan.inspectionType] || INSPECTION_TEMPLATES.food_truck;

  const lines = [
    'ON THE LINE CONSULTING',
    `${tmpl.label.toUpperCase()} — ACTION PLAN`,
    `Date: ${new Date().toLocaleDateString()}`,
    `Prepared by: Chris Petteys | (656) 217-0375`,
    '',
  ];
  if (client) lines.push(`Client: ${client.name}${client.biz ? ' — ' + client.biz : ''}`, '');

  const critical = plan.items.filter(i => i.priority === 'critical');
  const attention = plan.items.filter(i => i.priority === 'attention');

  if (critical.length > 0) {
    lines.push('--- CRITICAL — MUST FIX ---');
    critical.forEach(item => {
      const check = item.done ? '✓' : '☐';
      lines.push(`  ${check} [${item.section}] ${item.item}${item.note ? ' — ' + item.note : ''}`);
    });
    lines.push('');
  }

  if (attention.length > 0) {
    lines.push('--- ATTENTION — SHOULD ADDRESS ---');
    attention.forEach(item => {
      const check = item.done ? '✓' : '☐';
      lines.push(`  ${check} [${item.section}] ${item.item}${item.note ? ' — ' + item.note : ''}`);
    });
    lines.push('');
  }

  const doneCount = plan.items.filter(i => i.done).length;
  lines.push(`Progress: ${doneCount} / ${plan.items.length} complete`);
  lines.push('');
  lines.push('On The Line Consulting | onthelineconsulting.com');

  navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Plan copied!')).catch(() => toast('Copy failed'));
}

function renderPlans() {
  const el = document.getElementById('planList');
  if (!state.actionPlans || state.actionPlans.length === 0) {
    el.innerHTML = '<div class="empty-state">No action plans yet. Complete an inspection to generate one.</div>';
    return;
  }

  const sorted = [...state.actionPlans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  el.innerHTML = sorted.map(p => {
    const client = state.clients.find(c => c.id === p.clientId);
    const tmpl = INSPECTION_TEMPLATES[p.inspectionType] || INSPECTION_TEMPLATES.food_truck;
    const doneCount = p.items.filter(i => i.done).length;
    const totalCount = p.items.length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    const critical = p.items.filter(i => i.priority === 'critical' && !i.done).length;

    return `
      <div class="plan-card" onclick="viewActionPlan('${p.id}')">
        <div class="card-top">
          <div class="card-client">${client ? client.name : 'Unknown'}</div>
          <span class="status-badge ${p.status === 'completed' ? 'status-retainer' : 'status-active'}">${p.status === 'completed' ? 'done' : `${pct}%`}</span>
        </div>
        <div class="card-meta">
          ${tmpl.label} · ${totalCount} items${critical > 0 ? ` · ${critical} critical` : ''} · ${formatDate(p.createdAt)}
        </div>
        <div class="plan-mini-bar">
          <div class="plan-mini-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

async function upsertActionPlan(plan) {
  const { error } = await db.from('action_plans').upsert({
    id: plan.id, client_id: plan.clientId, inspection_id: plan.inspectionId,
    inspection_type: plan.inspectionType, items: plan.items,
    status: plan.status, created_at: plan.createdAt, updated_at: plan.updatedAt,
  });
  if (error) { console.error('Action plan save error:', error); toast('Plan save failed'); }
}

// ===========================
// SYNC (manual refresh)
// ===========================

async function syncAll() {
  const btn = document.getElementById('syncBtn');
  btn.classList.add('spinning');
  await loadFromSupabase();
  renderAll();
  btn.classList.remove('spinning');
  toast('Synced!');
}

// ===========================
// HELPERS
// ===========================

function populateClientDropdowns() {
  const options = '<option value="">Select a client...</option>' +
    state.clients.map(c => `<option value="${c.id}">${c.name}${c.biz ? ' — ' + c.biz : ''}</option>`).join('');
  document.getElementById('quoteClient').innerHTML = options;
  document.getElementById('inspectionClient').innerHTML = options;
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function typeLabel(type) {
  const map = {
    food_truck: 'Food Truck',
    trailer: 'Trailer',
    brick_mortar: 'Restaurant / Bar',
    stadium: 'Stadium / Venue',
    salon: 'Salon / Barbershop',
    digital_media: 'Digital Media / Content',
    retail: 'Retail / E-commerce',
    freelancer: 'Freelancer / Solo',
    other: 'Other',
  };
  return map[type] || type;
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal.id);
  });
});

// ===========================
// BOOT
// ===========================

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
