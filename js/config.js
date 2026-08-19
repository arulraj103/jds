// =========================================================
// Supabase project configuration
// =========================================================
const SUPABASE_URL = 'https://ueoujaagrxgzdqtjozja.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlb3VqYWFncnhnemRxdGpvemphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNTYzMDQsImV4cCI6MjEwMjYzMjMwNH0.ky-ecMD24NKvlANTkm1lItPcARLdAOX0VQWEy8W1Wn0';
// Single shared Supabase client used across the site
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Owner's WhatsApp number for one-time bookings (E.164 format, no + or spaces)
// TODO: replace with the real business WhatsApp number
const OWNER_WHATSAPP_NUMBER = '919629885790';
