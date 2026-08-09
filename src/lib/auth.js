import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// session === undefined -> still checking; null -> signed out; object -> signed in.
export function useAuth() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.subscription.unsubscribe();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading: session === undefined,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signInWithGoogle: () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }),
    signOut: () => supabase.auth.signOut(),
  };
}
