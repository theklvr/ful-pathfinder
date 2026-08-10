import { createClient } from '@supabase/supabase-js';

// Verifies the caller is a signed-in admin before any admin/*.js endpoint
// does anything. Uses the service role key server-side only -- the browser
// never receives it, so an admin action can't be forged by tampering with
// client code, only by having a real admin's session token.
export async function requireAdmin(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { error: 'Missing bearer token', status: 401 };

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: 'Server misconfigured', status: 500 };

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return { error: 'Invalid or expired session', status: 401 };

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
  if (!profile?.is_admin) return { error: 'Admin access required', status: 403 };

  return { supabase, user: userData.user };
}
