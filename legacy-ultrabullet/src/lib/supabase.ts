import { createClient } from "@supabase/supabase-js";

// These are public browser credentials. RLS protects the data; never put a
// Supabase secret/service-role key in this file or any frontend bundle.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://cpscdsduqxcuwzjhddoh.supabase.co";
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5CF99D-Y2Blsa36YUACc2Q_8HZz0Gfk";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export const isSupabaseConfigured = Boolean(supabase);
