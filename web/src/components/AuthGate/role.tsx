import { createContext, useContext } from 'react';
import type { UserRole } from './model';

export interface AuthRoleControls {
  role: UserRole;
  switchRole: (role: UserRole) => void;
}

export const AuthRoleContext = createContext<AuthRoleControls>({
  role: 'candidate',
  switchRole: () => {},
});

export function useAuthRole(): UserRole {
  return useContext(AuthRoleContext).role;
}

export function useAuthRoleControls(): AuthRoleControls {
  return useContext(AuthRoleContext);
}
