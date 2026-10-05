import { create } from 'zustand';
import type { User, RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  getStoredGuestClaimTokens,
  clearStoredGuestClaimTokens,
  claimGuestProgress,
} from './api';
import { useCO2Store } from './store';

async function syncGuestClaims(): Promise<void> {
  const tokens = getStoredGuestClaimTokens();
  if (tokens.length === 0) return;
  try {
    const res = await claimGuestProgress(tokens);
    if (res.success && res.claims_processed > 0) {
      clearStoredGuestClaimTokens();
    }
  } catch (err) {
    console.warn('Failed to claim guest progress:', err);
  }
}

export interface UserProfile {
  id: string;
  username: string;
  coins: number;
  total_co2_saved: number;
  prompts_optimized: number;
  created_at: string;
}

export type AuthStatus = 'loading' | 'anon' | 'authed';
export type AuthModalTab = 'login' | 'signup' | 'forgot' | 'check-email' | 'reset-password';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  status: AuthStatus;
  isAuthModalOpen: boolean;
  authModalTab: AuthModalTab;
  authNotice: string | null;

  openAuthModal: (tab?: AuthModalTab, notice?: string) => void;
  closeAuthModal: () => void;
  setAuthModalTab: (tab: AuthModalTab) => void;

  signUp: (params: {
    username: string;
    email: string;
    password: string;
  }) => Promise<{ success: boolean; requiresEmailConfirmation: boolean; error?: string }>;

  signIn: (params: {
    identifier: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string }>;

  signOut: () => Promise<void>;

  requestReset: (email: string) => Promise<{ success: boolean; error?: string }>;

  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;

  refreshProfile: () => Promise<void>;

  initializeAuth: () => Promise<() => void>;
}

let profileRealtimeChannel: RealtimeChannel | null = null;

function subscribeToProfileChanges(userId: string, onUpdate: (profile: UserProfile) => void) {
  if (profileRealtimeChannel) {
    supabase.removeChannel(profileRealtimeChannel);
    profileRealtimeChannel = null;
  }

  profileRealtimeChannel = supabase
    .channel(`public:profiles:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as UserProfile);
        }
      }
    )
    .subscribe();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  status: 'loading',
  isAuthModalOpen: false,
  authModalTab: 'login',
  authNotice: null,

  openAuthModal: (tab = 'login', notice?: string) => {
    set({ isAuthModalOpen: true, authModalTab: tab, authNotice: notice || null });
  },

  closeAuthModal: () => {
    set({ isAuthModalOpen: false, authNotice: null });
  },

  setAuthModalTab: (tab: AuthModalTab) => {
    set({ authModalTab: tab });
  },

  signUp: async ({ username, email, password }) => {
    try {
      const cleanUsername = username.toLowerCase().trim();
      const cleanEmail = email.toLowerCase().trim();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            username: cleanUsername,
          },
          emailRedirectTo: 'https://nemora.tech',
        },
      });

      if (error) {
        let msg = error.message;
        if (msg.toLowerCase().includes('already taken') || msg.toLowerCase().includes('duplicate')) {
          msg = 'Username already taken. Please choose another username.';
        } else if (msg.toLowerCase().includes('already registered')) {
          msg = 'Email already registered. Please log in.';
        }
        return { success: false, requiresEmailConfirmation: false, error: msg };
      }

      // If Supabase requires email confirmation, session will be null
      const requiresConfirmation = !data.session;

      if (data.user && data.session) {
        set({ user: data.user, status: 'authed' });
        await syncGuestClaims();
        await get().refreshProfile();
        await useCO2Store.getState().refreshGardenData(true);
      }

      return {
        success: true,
        requiresEmailConfirmation: requiresConfirmation,
      };
    } catch (err: any) {
      return { success: false, requiresEmailConfirmation: false, error: err.message || 'Signup failed' };
    }
  },

  signIn: async ({ identifier, password }) => {
    try {
      const cleanIdentifier = identifier.trim();

      // Call the login Edge Function which supports username OR email resolution
      const { data, error } = await supabase.functions.invoke<{
        session: { access_token: string; refresh_token: string };
        user: { id: string; email: string };
      }>('login', {
        body: {
          identifier: cleanIdentifier,
          password,
        },
      });

      if (error) {
        let message = 'Credentials not recognized';
        if (error.context && typeof error.context === 'object') {
          const resp = error.context as Response;
          if (resp.status === 429) {
            message = 'Too many login attempts. Please wait 60 seconds.';
          }
        }
        return { success: false, error: message };
      }

      if (!data?.session) {
        return { success: false, error: 'Credentials not recognized' };
      }

      // Establish session in supabase-js client
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) {
        return { success: false, error: 'Failed to establish session.' };
      }

      const { data: userData } = await supabase.auth.getUser();
      set({
        user: userData.user || null,
        status: 'authed',
        isAuthModalOpen: false,
      });

      if (userData.user) {
        await syncGuestClaims();
        await get().refreshProfile();
        await useCO2Store.getState().refreshGardenData(true);
        subscribeToProfileChanges(userData.user.id, (updatedProfile) => {
          set({ profile: updatedProfile });
        });
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Credentials not recognized' };
    }
  },

  signOut: async () => {
    if (profileRealtimeChannel) {
      supabase.removeChannel(profileRealtimeChannel);
      profileRealtimeChannel = null;
    }
    await supabase.auth.signOut();
    useCO2Store.getState().resetGardenData();
    set({
      user: null,
      profile: null,
      status: 'anon',
    });
  },

  requestReset: async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'https://nemora.tech/?reset=1',
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Password reset request failed.' };
    }
  },

  updatePassword: async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        return { success: false, error: error.message };
      }
      set({ isAuthModalOpen: false });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update password.' };
    }
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user) return;

    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && profileData) {
        set({ profile: profileData as UserProfile });
      }
    } catch (err) {
      console.warn('Failed to fetch profile:', err);
    }
  },

  initializeAuth: async () => {
    try {
      // 1. Check existing session from localStorage
      const { data: sessionData } = await supabase.auth.getSession();
      const initialUser = sessionData?.session?.user || null;

      if (initialUser) {
        set({ user: initialUser, status: 'authed' });
        await get().refreshProfile();
        await useCO2Store.getState().refreshGardenData(true);

        subscribeToProfileChanges(initialUser.id, (updatedProfile) => {
          set({ profile: updatedProfile });
        });
      } else {
        set({ user: null, profile: null, status: 'anon' });
      }

      // Check if URL has ?reset=1 password recovery param
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('reset') === '1') {
          set({ isAuthModalOpen: true, authModalTab: 'reset-password' });
        }
      }

      // 2. Subscribe to auth state changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const currentUser = session?.user || null;
          set({ user: currentUser, status: currentUser ? 'authed' : 'anon' });

          if (currentUser) {
            if (event === 'SIGNED_IN') {
              await syncGuestClaims();
            }
            await get().refreshProfile();
            await useCO2Store.getState().refreshGardenData(true);
            subscribeToProfileChanges(currentUser.id, (updatedProfile) => {
              set({ profile: updatedProfile });
            });
          }
        } else if (event === 'SIGNED_OUT') {
          if (profileRealtimeChannel) {
            supabase.removeChannel(profileRealtimeChannel);
            profileRealtimeChannel = null;
          }
          useCO2Store.getState().resetGardenData();
          set({ user: null, profile: null, status: 'anon' });
        } else if (event === 'PASSWORD_RECOVERY') {
          set({ isAuthModalOpen: true, authModalTab: 'reset-password' });
        }
      });

      return () => {
        subscription.unsubscribe();
        if (profileRealtimeChannel) {
          supabase.removeChannel(profileRealtimeChannel);
          profileRealtimeChannel = null;
        }
      };
    } catch (err) {
      console.error('Error initializing auth:', err);
      set({ status: 'anon' });
      return () => {};
    }
  },
}));
