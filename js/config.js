// =========================================================
// Supabase project configuration
// =========================================================
const SUPABASE_URL = 'https://cgdqdbxhpiqbjjelelpw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZHFkYnhocGlxYmpqZWxlbHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1OTIyNjYsImV4cCI6MjEwMjE2ODI2Nn0.h5NltvCBfr5Wb85_SFzAFHlWWc-xK1Q00TOTGD34eeM';

// Single shared Supabase client used across the site
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Owner's WhatsApp number for one-time bookings (E.164 format, no + or spaces)
// TODO: replace with the real business WhatsApp number
const OWNER_WHATSAPP_NUMBER = '919629885790';