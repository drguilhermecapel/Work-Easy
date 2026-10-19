import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserType, UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile;
  switchRole: (role: UserType, isHealth?: boolean) => void;
  isAuthenticated: boolean;
}

// Mock Users
const MOCK_CLIENT: UserProfile = {
  id: 'user-123',
  name: 'Maria Cliente',
  type: UserType.CLIENT,
  isHealthProfessional: false,
};

const MOCK_PROVIDER: UserProfile = {
  id: 'prov-456',
  name: 'João Pintor',
  type: UserType.PROVIDER,
  isHealthProfessional: false,
};

const MOCK_DOCTOR: UserProfile = {
  id: 'doc-789',
  name: 'Dr. Roberto Costa',
  type: UserType.PROVIDER,
  isHealthProfessional: true,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile>(MOCK_CLIENT);

  const switchRole = (role: UserType, isHealth: boolean = false) => {
    if (role === UserType.CLIENT) {
      setUser(MOCK_CLIENT);
    } else if (isHealth) {
      setUser(MOCK_DOCTOR);
    } else {
      setUser(MOCK_PROVIDER);
    }
  };

  return (
    <AuthContext.Provider value={{ user, switchRole, isAuthenticated: true }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};