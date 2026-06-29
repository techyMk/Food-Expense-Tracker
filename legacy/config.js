/* ------------------------------------------------------------------
   Supabase connection settings.

   1. Go to https://supabase.com  →  your project
   2. Settings (gear) → API
   3. Copy "Project URL"        into  url
   4. Copy "anon / public" key  into  anonKey   (NOT the service_role key)

   The anon key is safe to ship in the browser — your data is protected
   by Row Level Security (see supabase-schema.sql).
-------------------------------------------------------------------*/
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY",
};
