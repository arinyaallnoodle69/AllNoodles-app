const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pinPepper = process.env.LOGIN_PIN_PEPPER?.trim();

if (!supabaseUrl || !supabaseServiceKey || !pinPepper) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_N = 4096;

function createPinLookup(pin) {
  return crypto.createHmac("sha256", pinPepper).update(pin).digest("hex");
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(`${pin}:${pinPepper}`, salt, SCRYPT_KEY_LENGTH, { N: SCRYPT_N });
  return `scrypt:${SCRYPT_N}:${salt}:${derivedKey.toString("hex")}`;
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  // 1. Get organization_id from the existing Owner user
  const { data: owner, error: ownerError } = await supabase
    .from('app_users')
    .select('organization_id')
    .eq('display_name', 'Owner')
    .single();

  if (ownerError || !owner) {
    console.error("Failed to find Owner user to get organization_id:", ownerError);
    return;
  }

  const organizationId = owner.organization_id;
  console.log(`Found organization ID: ${organizationId}`);

  // 2. Prepare member data
  const targetPin = "111111";
  const pinLookup = createPinLookup(targetPin);
  const pinHash = hashPin(targetPin);

  const newMember = {
    organization_id: organizationId,
    display_name: 'Member',
    email: 'member@allnoodles.com',
    role: 'member',
    pin_lookup: pinLookup,
    pin_hash: pinHash,
    is_active: true
  };

  // 3. Insert the member user
  const { data: inserted, error: insertError } = await supabase
    .from('app_users')
    .insert(newMember)
    .select()
    .single();

  if (insertError) {
    console.error("Failed to create Member user:", insertError);
    return;
  }

  console.log(`Successfully created user: ${inserted.display_name} (Role: ${inserted.role})`);
  console.log(`PIN for this member user is: ${targetPin}`);
}

main();
