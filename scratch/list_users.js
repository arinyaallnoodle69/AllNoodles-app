const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const { data: users, error } = await supabase
    .from('app_users')
    .select('id, display_name, email, role, is_active');

  if (error) {
    console.error("Error fetching users:", error);
    return;
  }

  console.log("Registered Users:");
  users.forEach(u => {
    console.log(`- ${u.display_name} (Role: ${u.role}, Active: ${u.is_active}, ID: ${u.id})`);
  });
}

main();
