import React, { createContext, useState, useEffect, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uuid, setUuid] = useState('');

    useEffect(() => {
        // Gerar ou Recuperar UUID do dispositivo
        let deviceUuid = localStorage.getItem('cinegeek_uuid');
        if (!deviceUuid) {
            deviceUuid = uuidv4();
            localStorage.setItem('cinegeek_uuid', deviceUuid);
        }
        setUuid(deviceUuid);

        // Verificar Login Existente
        const token = localStorage.getItem('cinegeek_token');
        if (token) {
            checkUser(token);
        } else {
            setLoading(false);
        }
    }, []);

    const checkUser = async (token) => {
        try {
            const resp = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                setUser(data);
            } else {
                localStorage.removeItem('cinegeek_token');
            }
        } catch (err) {
            console.error("Erro ao validar sessão", err);
        } finally {
            setLoading(false);
        }
    };

    const login = (userData, token) => {
        setUser(userData);
        localStorage.setItem('cinegeek_token', token);
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('cinegeek_token');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, uuid }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
