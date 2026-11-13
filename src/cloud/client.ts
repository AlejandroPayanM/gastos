import './polyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Estas variables se incrustan al compilar (por eso empiezan con EXPO_PUBLIC_).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True si la app se compiló con los datos de Supabase; si no, funciona solo en local. */
export const cloudConfigured = Boolean(url && anonKey && !url.includes('TU-PROYECTO'));

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // En la web lee el enlace de confirmación / recuperación de contraseña de la URL.
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
