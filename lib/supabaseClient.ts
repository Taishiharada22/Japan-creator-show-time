import { createClient } from "@supabase/supabase-js";

// ★ ここに自分の Supabase の URL と anon キーを直書き
const supabaseUrl = "https://czxmtdqbyeeouvtdbmul.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eG10ZHFieWVlb3V2dGRibXVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MDMyODEsImV4cCI6MjA4MTA3OTI4MX0.tUishh6Ba8hbQVZjDRzzcnPC4oD5Z4dxAc3mB9yxiBs";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);