import type { SupabaseClient } from '@supabase/supabase-js';
import type { DB } from '../types';
import type { CloudApi, RemoteRow } from './engine';

/** Acceso a la fila del usuario en la tabla `user_data` (ver supabase/schema.sql). */
export function supabaseApi(client: SupabaseClient, userId: string): CloudApi {
  return {
    async pull() {
      const { data, error } = await client.from('user_data').select('data, version').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? ({ data: data.data as DB, version: data.version as number } satisfies RemoteRow) : null;
    },

    async insert(db: DB) {
      const { data, error } = await client.from('user_data').insert({ user_id: userId, data: db, version: 1 }).select('version').single();
      // 23505 = ya existe la fila (otro dispositivo la creó primero)
      if (error) {
        if (error.code === '23505') return 'conflict';
        throw new Error(error.message);
      }
      return { data: db, version: data.version as number };
    },

    async update(db: DB, baseVersion: number) {
      const { data, error } = await client
        .from('user_data')
        .update({ data: db, version: baseVersion + 1, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('version', baseVersion)
        .select('version');
      if (error) throw new Error(error.message);
      // Si nadie coincide con esa versión, otro dispositivo guardó antes.
      if (!data || data.length === 0) return 'conflict';
      return { data: db, version: data[0].version as number };
    },
  };
}
