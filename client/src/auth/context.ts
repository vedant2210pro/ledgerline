import { createContext, useContext } from 'react';
import type { User } from '@ledgerline/shared';
export type AuthState = {
  user: User | null;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => void;
};
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('Auth context missing');
  return auth;
}
