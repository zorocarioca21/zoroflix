// src/components/ThemeInjector.jsx
// Injetor de Tema Público e Ouvinte de Live Preview para Sandbox do CineGeek

import React, { useEffect, useState } from 'react';

export default function ThemeInjector() {
    const [theme, setTheme] = useState(null);

    // 1. Carrega o tema ativo publicado do servidor ao inicializar
    useEffect(() => {
        let isMounted = true;

        const isPreviewMode = window.location.search.includes('theme_preview=1') || window.self !== window.top;

        const loadActiveTheme = async () => {
            // Se estiver em modo preview com dados salvos no localStorage, não sobrescreve com o tema público
            if (isPreviewMode) {
                const savedPreview = localStorage.getItem('cinegeek_theme_preview_storage');
                if (savedPreview) {
                    try {
                        const parsed = JSON.parse(savedPreview);
                        if (isMounted) updatePreviewState(parsed);
                        return;
                    } catch (e) {}
                }
            }

            try {
                const res = await fetch('/api/theme/active');
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && data) {
                        // Se estiver no preview, só aplica se ainda não tiver recebido o preview
                        setTheme(prev => {
                            if (isPreviewMode && (prev?.custom_css || prev?.custom_html_body || prev?.custom_html_head)) {
                                return prev;
                            }
                            return data;
                        });
                    }
                }
            } catch (err) {
                // Silencioso para o usuário
            }
        };

        // Carrega inicialmente do localStorage se for preview para não dar flash de tema padrão
        if (isPreviewMode) {
            const savedPreview = localStorage.getItem('cinegeek_theme_preview_storage');
            if (savedPreview) {
                try {
                    const parsed = JSON.parse(savedPreview);
                    updatePreviewState(parsed);
                } catch (e) {}
            }
        }

        loadActiveTheme();

        // 2. Listener de Live Sandbox Preview para quando estiver no iframe ou em outra aba de tela inteira
        const updatePreviewState = (data) => {
            if (!data || typeof data !== 'object') return;
            const { custom_css, custom_html_body, custom_html_head } = data;
            setTheme(prev => ({
                ...(prev || {}),
                custom_css: custom_css !== undefined ? custom_css : (prev?.custom_css || ''),
                custom_html_head: custom_html_head !== undefined ? custom_html_head : (prev?.custom_html_head || ''),
                custom_html_body: custom_html_body !== undefined ? custom_html_body : (prev?.custom_html_body || '')
            }));
        };

        const handleMessage = (event) => {
            if (event.data?.type === 'CINEGEEK_THEME_PREVIEW') {
                updatePreviewState(event.data);
            }
        };

        // BroadcastChannel para sincronizar aba externa aberta em tela cheia
        let broadcastChannel = null;
        try {
            broadcastChannel = new BroadcastChannel('cinegeek_theme_preview_channel');
            broadcastChannel.onmessage = (event) => {
                if (event.data?.type === 'CINEGEEK_THEME_PREVIEW') {
                    updatePreviewState(event.data);
                }
            };
        } catch (e) {}

        // Fallback via storage event
        const handleStorage = (e) => {
            if (e.key === 'cinegeek_theme_preview_storage' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    updatePreviewState(parsed);
                } catch (err) {}
            }
        };

        window.addEventListener('message', handleMessage);
        window.addEventListener('storage', handleStorage);

        return () => {
            isMounted = false;
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorage);
            if (broadcastChannel) broadcastChannel.close();
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
