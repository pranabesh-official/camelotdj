import React from 'react';
import { useAuth } from '../services/AuthContext';
import UserProfileDisplay from './UserProfileDisplay';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, signOutUser } = useAuth();

    return (
        <div style={{ height: '100%' }}>
            {/* Main content */}
            <div style={{ height: '100%', boxSizing: 'border-box' }}>
                {children}
            </div>
        </div>
    );
};

export default AuthGate;
