// src/components/ThemeInjector.jsx
// Injetor de Tema Público e Ouvinte de Live Preview para Sandbox do CineGeek

import React, { useEffect, useState } from 'react';

export default function ThemeInjector() {
    const [theme, setTheme] = useState(null);

    // 1. Carrega o tema ativo publicado do servidor ao inicializar
    useEffect(() => {
        let isMounted = true;

        const loadActiveTheme = async () => {
            try {
                const res = await fetch('/api/theme/active');
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && data) {
                        setTheme(data);
                    }
                }
            } catch (err) {
                // Silencioso para o usuário
            }
        };

        loadActiveTheme();

        // 2. Listener de Live Sandbox Preview para quando estiver sendo renderizado dentro do iframe do /paineladm
        const handleMessage = (event) => {
            // Aceita mensagens de sandbox do mesmo domínio
            if (!event.data || typeof event.data !== 'object') return;
            if (event.data.type === 'CINEGEEK_THEME_PREVIEW') {
                const { custom_css, custom_html_body, custom_html_head } = event.data;
                setTheme(prev => ({
                    ...(prev || {}),
                    custom_css: custom_css !== undefined ? custom_css : (prev?.custom_css || ''),
                    custom_html_head: custom_html_head !== undefined ? custom_html_head : (prev?.custom_html_head || ''),
                    custom_html_body: custom_html_body !== undefined ? custom_html_body : (prev?.custom_html_body || '')
                }));
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            isMounted = false;
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // 3. Injeta scripts e tags extras do head dinamicamente
    useEffect(() => {
        if (!theme?.custom_html_head) {
            const oldHead = document.getElementById('custom-theme-head-container');
            if (oldHead) oldHead.innerHTML = '';
            return;
        }

        let headContainer = document.getElementById('custom-theme-head-container');
        if (!headContainer) {
            headContainer = document.createElement('div');
            headContainer.id = 'custom-theme-head-container';
            document.head.appendChild(headContainer);
        }

        // Utiliza Range para permitir que scripts injetados no head sejam executados pelo browser
        headContainer.innerHTML = '';
        try {
            const range = document.createRange();
            range.selectNode(headContainer);
            const fragment = range.createContextualFragment(theme.custom_html_head);
            headContainer.appendChild(fragment);
        } catch (e) {
            headContainer.innerHTML = theme.custom_html_head;
        }
    }, [theme?.custom_html_head]);

    return (
        <>
            {/* Tag <style> oficial com todo o CSS customizado e sobrescrito */}
            <style id="custom-theme-css">
                {theme?.custom_css || ''}
            </style>

            {/* Container para injeções HTML no body (banners sazonais, partículas, neve, etc.) */}
            {theme?.custom_html_body ? (
                <div 
                    id="custom-theme-body-container"
                    dangerouslySetInnerHTML={{ __html: theme.custom_html_body }}
                />
            ) : null}
        </>
    );
}
