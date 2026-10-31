// src/components/ThemeLiveEditor.jsx
// Live Code Editor & Gerenciador de Snapshots de Temas com Sandbox Split View
// Estilo CineGeek Neon (#00e676), Monaco/CodeMirror feel, Tabs CSS/HTML, Live postMessage e Alternador Desktop/Mobile

import React, { useState, useEffect, useRef } from 'react';
import { 
    Paintbrush, Save, Plus, Rocket, Trash2, Smartphone, Monitor, 
    RotateCcw, Code, Eye, Sparkles, Check, AlertCircle, Layers, CheckCircle,
    Maximize2, ExternalLink, EyeOff
} from 'lucide-react';

export default function ThemeLiveEditor() {
    const [themes, setThemes] = useState([]);
    const [selectedThemeId, setSelectedThemeId] = useState(null);
    const [themeName, setThemeName] = useState('');
    const [customCss, setCustomCss] = useState('');
    const [customHtmlBody, setCustomHtmlBody] = useState('');
    const [customHtmlHead, setCustomHtmlHead] = useState('');
    const [activeTab, setActiveTab] = useState('css'); // 'css' | 'body' | 'head'
    const [previewMode, setPreviewMode] = useState('desktop'); // 'desktop' | 'mobile'
    const [previewLayout, setPreviewLayout] = useState('split'); // 'split' | 'fullscreen' | 'hidden'

    const handleOpenExternalFullPreview = () => {
        // Envia os dados atuais para o localStorage antes de abrir a aba
        broadcastToPreview(customCss, customHtmlBody, customHtmlHead);
        window.open('/?theme_preview=1', '_blank');
    };

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activating, setActivating] = useState(false);
    const [notification, setNotification] = useState(null);

    // Modal para "Salvar como Novo Tema"
    const [isNewThemeModalOpen, setIsNewThemeModalOpen] = useState(false);
    const [newThemeNameInput, setNewThemeNameInput] = useState('');

    const iframeRef = useRef(null);
    const debounceTimerRef = useRef(null);

    // Toast de notificação
    const showNotice = (text, type = 'success') => {
        setNotification({ text, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const getAuthHeaders = () => {
        const token = localStorage.getItem('cinegeek_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        };
    };

    // 1. Carrega todos os temas disponíveis
    const fetchThemes = async (selectId = null) => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/themes', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setThemes(data);

                // Seleciona o tema ativo por padrão ou o especificado
                let target = null;
                if (selectId) {
                    target = data.find(t => t.id === Number(selectId));
                }
                if (!target) {
                    target = data.find(t => t.is_active === 1) || data[0];
                }

                if (target) {
                    applyThemeToEditor(target);
                }
            } else {
                showNotice('Erro ao buscar lista de temas', 'error');
            }
        } catch (err) {
            console.error(err);
            showNotice('Falha de conexão com o servidor', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchThemes();
    }, []);

    // Aplica os dados do tema selecionado no editor
    const applyThemeToEditor = (theme) => {
        setSelectedThemeId(theme.id);
        setThemeName(theme.name);
        setCustomCss(theme.custom_css || '');
        setCustomHtmlBody(theme.custom_html_body || '');
        setCustomHtmlHead(theme.custom_html_head || '');

        // Atualiza imediatamente o sandbox preview
        broadcastToPreview(theme.custom_css || '', theme.custom_html_body || '', theme.custom_html_head || '');
    };

    // Seleção de tema pelo dropdown
    const handleSelectTheme = (e) => {
        const id = parseInt(e.target.value, 10);
        const found = themes.find(t => t.id === id);
        if (found) {
            applyThemeToEditor(found);
        }
    };

    // 2. Envia modificações de CSS/HTML para o iframe e para qualquer aba externa de preview em tela cheia
    const broadcastToPreview = (css, htmlBody, htmlHead) => {
        const payload = {
            type: 'CINEGEEK_THEME_PREVIEW',
            custom_css: css,
            custom_html_body: htmlBody,
            custom_html_head: htmlHead
        };

        // Envia para o iframe local se existir
        if (iframeRef.current && iframeRef.current.contentWindow) {
            try {
                iframeRef.current.contentWindow.postMessage(payload, '*');
            } catch (e) {}
        }

        // Envia para abas abertas externamente em tela inteira via BroadcastChannel
        try {
            const bc = new BroadcastChannel('cinegeek_theme_preview_channel');
            bc.postMessage(payload);
            bc.close();
        } catch (e) {}

        // Guarda em localStorage para persistência em reload da aba externa
        try {
            localStorage.setItem('cinegeek_theme_preview_storage', JSON.stringify(payload));
        } catch (e) {}
    };

    // Dispara a sincronização com debounce leve de 150ms enquanto digita
    useEffect(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            broadcastToPreview(customCss, customHtmlBody, customHtmlHead);
        }, 150);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [customCss, customHtmlBody, customHtmlHead]);

    // Recarrega o iframe quando ele terminar de montar para receber o estado inicial
    const handleIframeLoad = () => {
        broadcastToPreview(customCss, customHtmlBody, customHtmlHead);
    };

    // 3. Salvar alterações no tema atual
    const handleSaveCurrentTheme = async () => {
        if (!selectedThemeId) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/themes/${selectedThemeId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: themeName,
                    custom_css: customCss,
                    custom_html_body: customHtmlBody,
                    custom_html_head: customHtmlHead
                })
            });

            if (res.ok) {
                const updated = await res.json();
                showNotice('Alterações do tema salvas com sucesso!');
                // Atualiza a lista mantendo a seleção
                setThemes(prev => prev.map(t => t.id === updated.id ? updated : t));
            } else {
                const errData = await res.json();
                showNotice(errData.error || 'Erro ao salvar alterações', 'error');
            }
        } catch (err) {
            showNotice('Falha na comunicação com o servidor', 'error');
        } finally {
            setSaving(false);
        }
    };

    // 4. Salvar como Novo Tema (Snapshot)
    const handleCreateNewTheme = async (e) => {
        if (e) e.preventDefault();
        if (!newThemeNameInput.trim()) {
            showNotice('Digite um nome para o novo tema', 'error');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/admin/themes', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: newThemeNameInput.trim(),
                    custom_css: customCss,
                    custom_html_body: customHtmlBody,
                    custom_html_head: customHtmlHead
                })
            });

            if (res.ok) {
                const created = await res.json();
                showNotice(`Novo tema "${created.name}" criado com sucesso!`);
                setIsNewThemeModalOpen(false);
                setNewThemeNameInput('');
                await fetchThemes(created.id);
            } else {
                const errData = await res.json();
                showNotice(errData.error || 'Erro ao criar novo tema', 'error');
            }
        } catch (err) {
            showNotice('Falha ao conectar com o servidor', 'error');
        } finally {
            setSaving(false);
        }
    };

    // 5. Publicar Tema para o Público (Ativar)
    const handlePublishTheme = async () => {
        if (!selectedThemeId) return;
        const currentSelected = themes.find(t => t.id === selectedThemeId);
        const confirmMsg = `Deseja realmente publicar o tema "${currentSelected?.name || 'Selecionado'}" para todos os visitantes do site CineGeek agora?`;
        if (!window.confirm(confirmMsg)) return;

        setActivating(true);
        try {
            // Salva antes de ativar para garantir que o código modificado vá para produção
            await fetch(`/api/admin/themes/${selectedThemeId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: themeName,
                    custom_css: customCss,
                    custom_html_body: customHtmlBody,
                    custom_html_head: customHtmlHead
                })
            });

            const res = await fetch(`/api/admin/themes/${selectedThemeId}/activate`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            if (res.ok) {
                showNotice(`🚀 Tema "${currentSelected?.name}" publicado com sucesso para todos!`);
                await fetchThemes(selectedThemeId);
            } else {
                const errData = await res.json();
                showNotice(errData.error || 'Erro ao publicar tema', 'error');
            }
        } catch (err) {
            showNotice('Falha ao ativar tema no servidor', 'error');
        } finally {
            setActivating(false);
        }
    };

    // 6. Excluir Tema
    const handleDeleteTheme = async () => {
        if (!selectedThemeId) return;
        const currentSelected = themes.find(t => t.id === selectedThemeId);
        if (currentSelected?.is_active === 1) {
            showNotice('Não é possível excluir o tema que está publicado e ativo no site!', 'error');
            return;
        }

        if (!window.confirm(`Tem certeza que deseja excluir o snapshot do tema "${currentSelected?.name}"?`)) return;

        try {
            const res = await fetch(`/api/admin/themes/${selectedThemeId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (res.ok) {
                showNotice('Tema excluído com sucesso.');
                await fetchThemes();
            } else {
                const errData = await res.json();
                showNotice(errData.error || 'Erro ao excluir tema', 'error');
            }
        } catch (err) {
            showNotice('Falha ao conectar com o servidor', 'error');
        }
    };

    const activeThemeObj = themes.find(t => t.id === selectedThemeId);
    const isCurrentlyPublished = activeThemeObj?.is_active === 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', width: '100%', height: 'calc(100vh - 120px)' }}>
            {/* TOAST FLUTUANTE */}
            {notification && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: 99999,
                    background: notification.type === 'error' ? '#ef4444' : '#00e676',
                    color: notification.type === 'error' ? '#fff' : '#000',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    fontWeight: '800',
                    fontSize: '0.95rem',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    {notification.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                    {notification.text}
                </div>
            )}

            {/* BARRA SUPERIOR DE CONTROLE E AÇÕES RÁPIDAS (COMPACTA & RESPONSIVA) */}
            <div style={{
                background: '#13131a',
                border: '1px solid #27272a',
                borderRadius: '14px',
                padding: '0.75rem 1rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                {/* Seletor de Tema Salvo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px', flex: '1 1 auto' }}>
                    <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        background: 'rgba(0, 230, 118, 0.15)',
                        color: '#00e676',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Paintbrush size={18} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '160px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#a1a1aa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Tema Ativo no Editor
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <select
                                value={selectedThemeId || ''}
                                onChange={handleSelectTheme}
                                style={{
                                    background: '#1c1c24',
                                    color: '#fff',
                                    border: '1px solid #3f3f46',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '0.88rem',
                                    fontWeight: '700',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    maxWidth: '220px'
                                }}
                            >
                                {themes.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} {t.is_active === 1 ? '🌟 (No Ar)' : ''}
                                    </option>
                                ))}
                            </select>

                            {isCurrentlyPublished && (
                                <span style={{
                                    background: 'rgba(0, 230, 118, 0.2)',
                                    color: '#00e676',
                                    border: '1px solid rgba(0, 230, 118, 0.4)',
                                    padding: '3px 6px',
                                    borderRadius: '5px',
                                    fontSize: '0.7rem',
                                    fontWeight: '800'
                                }}>
                                    NO AR
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Alternador de Modo de Visualização do Painel (Editor, Dividido, Tela Cheia) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#1c1c24',
                    padding: '3px',
                    borderRadius: '8px',
                    border: '1px solid #27272a',
                    gap: '2px'
                }}>
                    <button
                        onClick={() => setPreviewLayout('hidden')}
                        title="Ver apenas o editor de código"
                        style={{
                            background: previewLayout === 'hidden' ? '#27272a' : 'transparent',
                            color: previewLayout === 'hidden' ? '#00e676' : '#a1a1aa',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 9px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <Code size={13} /> Só Código
                    </button>
                    <button
                        onClick={() => setPreviewLayout('split')}
                        title="Ver código e prévia lado a lado"
                        style={{
                            background: previewLayout === 'split' ? '#27272a' : 'transparent',
                            color: previewLayout === 'split' ? '#00e676' : '#a1a1aa',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 9px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <Layers size={13} /> Dividido
                    </button>
                    <button
                        onClick={() => setPreviewLayout('fullscreen')}
                        title="Ver prévia ocupando toda a tela"
                        style={{
                            background: previewLayout === 'fullscreen' ? '#00e676' : 'transparent',
                            color: previewLayout === 'fullscreen' ? '#000' : '#a1a1aa',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 9px',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <Maximize2 size={13} /> Só Prévia
                    </button>
                </div>

                {/* Botões de Ação do Tema */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setIsNewThemeModalOpen(true)}
                        title="Salvar o código atual como um novo snapshot de tema"
                        style={{
                            background: '#27272a',
                            color: '#f4f4f5',
                            border: '1px solid #3f3f46',
                            borderRadius: '8px',
                            padding: '6px 11px',
                            fontWeight: '700',
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Plus size={14} /> Novo Tema
                    </button>

                    <button
                        onClick={handleSaveCurrentTheme}
                        disabled={saving}
                        title="Salvar alterações no tema selecionado"
                        style={{
                            background: '#3f3f46',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontWeight: '700',
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            opacity: saving ? 0.6 : 1,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
                    </button>

                    {/* BOTÃO PRINCIPAL: ABRIR PRÉVIA EM NOVA ABA (TELA INTEIRA REAL) */}
                    <button
                        onClick={handleOpenExternalFullPreview}
                        title="Abrir o site oficial em outra aba com sincronização ao vivo do tema"
                        style={{
                            background: 'rgba(0, 230, 118, 0.1)',
                            color: '#00e676',
                            border: '1px solid rgba(0, 230, 118, 0.4)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontWeight: '800',
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <ExternalLink size={14} /> Nova Aba
                    </button>

                    <button
                        onClick={handlePublishTheme}
                        disabled={activating || isCurrentlyPublished}
                        style={{
                            background: isCurrentlyPublished 
                                ? '#1c1c24' 
                                : 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)',
                            color: isCurrentlyPublished ? '#71717a' : '#000',
                            border: isCurrentlyPublished ? '1px solid #27272a' : 'none',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            fontWeight: '900',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: isCurrentlyPublished ? 'default' : 'pointer',
                            boxShadow: isCurrentlyPublished ? 'none' : '0 2px 10px rgba(0, 230, 118, 0.3)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Rocket size={14} />
                        {activating ? 'Publicando...' : isCurrentlyPublished ? 'Publicado' : 'Publicar'}
                    </button>

                    {!isCurrentlyPublished && (
                        <button
                            onClick={handleDeleteTheme}
                            title="Excluir este tema"
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '8px',
                                padding: '6px 9px',
                                cursor: 'pointer'
                            }}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* LAYOUT GRID DINÂMICO (SPLIT VIEW, FULLSCREEN OU APENAS EDITOR) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: previewLayout === 'split' ? 'minmax(420px, 1fr) 1.25fr' : '1fr',
                gap: previewLayout === 'split' ? '1.2rem' : '0',
                flex: 1,
                minHeight: '75vh',
                height: 'calc(100vh - 180px)',
                width: '100%'
            }}>
                {/* COLUNA ESQUERDA: LIVE CODE EDITOR */}
                <div style={{
                    background: '#13131a',
                    border: '1px solid #27272a',
                    borderRadius: '18px',
                    display: previewLayout === 'fullscreen' ? 'none' : 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* Header de Abas do Editor */}
                    <div style={{
                        background: '#0d0d12',
                        borderBottom: '1px solid #27272a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 1rem'
                    }}>
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button
                                onClick={() => setActiveTab('css')}
                                style={{
                                    background: activeTab === 'css' ? '#13131a' : 'transparent',
                                    color: activeTab === 'css' ? '#00e676' : '#a1a1aa',
                                    border: 'none',
                                    borderBottom: activeTab === 'css' ? '2px solid #00e676' : '2px solid transparent',
                                    padding: '12px 18px',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Code size={16} /> CSS Customizado
                            </button>

                            <button
                                onClick={() => setActiveTab('body')}
                                style={{
                                    background: activeTab === 'body' ? '#13131a' : 'transparent',
                                    color: activeTab === 'body' ? '#00e676' : '#a1a1aa',
                                    border: 'none',
                                    borderBottom: activeTab === 'body' ? '2px solid #00e676' : '2px solid transparent',
                                    padding: '12px 18px',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Sparkles size={16} /> HTML Body (Efeitos / Banners)
                            </button>

                            <button
                                onClick={() => setActiveTab('head')}
                                style={{
                                    background: activeTab === 'head' ? '#13131a' : 'transparent',
                                    color: activeTab === 'head' ? '#00e676' : '#a1a1aa',
                                    border: 'none',
                                    borderBottom: activeTab === 'head' ? '2px solid #00e676' : '2px solid transparent',
                                    padding: '12px 18px',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Layers size={16} /> Head / Scripts
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                onClick={handleOpenExternalFullPreview}
                                title="Abrir prévia do site em tela cheia em outra aba"
                                style={{
                                    background: 'transparent',
                                    color: '#00e676',
                                    border: 'none',
                                    fontSize: '0.78rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '4px 8px',
                                    borderRadius: '6px'
                                }}
                            >
                                <ExternalLink size={14} /> Prévia em Nova Aba
                            </button>

                            <button
                                onClick={() => setPreviewLayout(prev => prev === 'hidden' ? 'split' : 'hidden')}
                                title={previewLayout === 'hidden' ? 'Exibir Preview ao lado' : 'Ocultar Preview para focar no código'}
                                style={{
                                    background: previewLayout === 'hidden' ? '#27272a' : 'transparent',
                                    color: '#a1a1aa',
                                    border: '1px solid #3f3f46',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '4px 8px',
                                    borderRadius: '6px'
                                }}
                            >
                                <EyeOff size={13} />
                                {previewLayout === 'hidden' ? 'Mostrar Preview' : 'Ocultar Preview'}
                            </button>

                            <span style={{ fontSize: '0.75rem', color: '#71717a', fontFamily: 'monospace' }}>
                                {activeTab === 'css' ? `${customCss.length} caracteres` : `${customHtmlBody.length + customHtmlHead.length} caracteres`}
                            </span>
                        </div>
                    </div>

                    {/* Área de Edição com Fonte Monospaced */}
                    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        {activeTab === 'css' && (
                            <textarea
                                value={customCss}
                                onChange={(e) => setCustomCss(e.target.value)}
                                placeholder="/* Digite seu CSS aqui. Ele atualizará a prévia instantaneamente ao lado! */&#10;:root {&#10;  --primary-accent: #00e676;&#10;}&#10;body {&#10;  /* Estilos customizados */&#10;}"
                                spellCheck={false}
                                style={{
                                    flex: 1,
                                    width: '100%',
                                    background: '#0d0d12',
                                    color: '#00ff88',
                                    fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
                                    fontSize: '0.9rem',
                                    lineHeight: '1.6',
                                    padding: '1.2rem',
                                    border: 'none',
                                    outline: 'none',
                                    resize: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        )}

                        {activeTab === 'body' && (
                            <textarea
                                value={customHtmlBody}
                                onChange={(e) => setCustomHtmlBody(e.target.value)}
                                placeholder="<!-- Snippets e Elementos HTML injetados no body (Ex: Banner sazonal de Halloween, morcegos voando, efeito de neve) -->&#10;<div style='position: fixed; bottom: 20px; right: 20px; z-index: 9999; background: #00e676; color: #000; padding: 10px 20px; border-radius: 12px; font-weight: 800;'>&#10;  🎃 Especial de Temporada&#10;</div>"
                                spellCheck={false}
                                style={{
                                    flex: 1,
                                    width: '100%',
                                    background: '#0d0d12',
                                    color: '#38bdf8',
                                    fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
                                    fontSize: '0.9rem',
                                    lineHeight: '1.6',
                                    padding: '1.2rem',
                                    border: 'none',
                                    outline: 'none',
                                    resize: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        )}

                        {activeTab === 'head' && (
                            <textarea
                                value={customHtmlHead}
                                onChange={(e) => setCustomHtmlHead(e.target.value)}
                                placeholder="<!-- Tags extras no <head> (ex: fontes do Google Fonts, links CDN, scripts de partículas) -->&#10;<link rel='stylesheet' href='https://fonts.googleapis.com/css2?family=Creepster&display=swap'>"
                                spellCheck={false}
                                style={{
                                    flex: 1,
                                    width: '100%',
                                    background: '#0d0d12',
                                    color: '#facc15',
                                    fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
                                    fontSize: '0.9rem',
                                    lineHeight: '1.6',
                                    padding: '1.2rem',
                                    border: 'none',
                                    outline: 'none',
                                    resize: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* COLUNA DIREITA: LIVE SANDBOX PREVIEW */}
                <div style={{
                    background: '#13131a',
                    border: '1px solid #27272a',
                    borderRadius: '18px',
                    display: previewLayout === 'hidden' ? 'none' : 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* Barra de Ferramentas da Sandbox (Compacta e Flexível) */}
                    <div style={{
                        background: '#0d0d12',
                        borderBottom: '1px solid #27272a',
                        padding: '6px 12px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '120px' }}>
                            <Eye size={15} color="#00e676" />
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#fff' }}>
                                Prévia
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#71717a' }}>• Ao Vivo</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {/* Alternador Desktop / Mobile */}
                            <div style={{ display: 'flex', background: '#1c1c24', borderRadius: '6px', padding: '2px', gap: '2px' }}>
                                <button
                                    onClick={() => setPreviewMode('desktop')}
                                    title="Modo Desktop"
                                    style={{
                                        background: previewMode === 'desktop' ? '#00e676' : 'transparent',
                                        color: previewMode === 'desktop' ? '#000' : '#a1a1aa',
                                        border: 'none',
                                        borderRadius: '5px',
                                        padding: '4px 8px',
                                        fontSize: '0.72rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Monitor size={13} /> PC
                                </button>
                                <button
                                    onClick={() => setPreviewMode('mobile')}
                                    title="Modo Mobile (390px)"
                                    style={{
                                        background: previewMode === 'mobile' ? '#00e676' : 'transparent',
                                        color: previewMode === 'mobile' ? '#000' : '#a1a1aa',
                                        border: 'none',
                                        borderRadius: '5px',
                                        padding: '4px 8px',
                                        fontSize: '0.72rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Smartphone size={13} /> Celular
                                </button>
                            </div>

                            {/* Botão Tela Inteira (Maximizar no Painel) */}
                            <button
                                onClick={() => setPreviewLayout(prev => prev === 'fullscreen' ? 'split' : 'fullscreen')}
                                title={previewLayout === 'fullscreen' ? 'Restaurar Split View' : 'Maximizar Preview na Tela Inteira'}
                                style={{
                                    background: previewLayout === 'fullscreen' ? 'rgba(0, 230, 118, 0.2)' : '#1c1c24',
                                    color: previewLayout === 'fullscreen' ? '#00e676' : '#f4f4f5',
                                    border: '1px solid #3f3f46',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Maximize2 size={13} />
                                {previewLayout === 'fullscreen' ? 'Dividir' : 'Expandir'}
                            </button>

                            {/* Botão Abrir em Nova Aba (Full Page Live Sandbox) */}
                            <button
                                onClick={handleOpenExternalFullPreview}
                                title="Abrir o site em outra aba com Live Preview sincronizado em tempo real"
                                style={{
                                    background: 'rgba(0, 230, 118, 0.1)',
                                    color: '#00e676',
                                    border: '1px solid rgba(0, 230, 118, 0.4)',
                                    borderRadius: '6px',
                                    padding: '4px 9px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <ExternalLink size={13} />
                                Nova Aba
                            </button>
                        </div>
                    </div>

                    {/* Moldura do Iframe */}
                    <div style={{
                        flex: 1,
                        background: '#09090b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: previewMode === 'mobile' ? '1rem' : '0',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: previewMode === 'mobile' ? '390px' : '100%',
                            height: previewMode === 'mobile' ? '780px' : '100%',
                            maxHeight: '100%',
                            borderRadius: previewMode === 'mobile' ? '32px' : '0',
                            border: previewMode === 'mobile' ? '8px solid #27272a' : 'none',
                            boxShadow: previewMode === 'mobile' ? '0 20px 50px rgba(0,0,0,0.8)' : 'none',
                            overflow: 'hidden',
                            position: 'relative',
                            background: '#000',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}>
                            <iframe
                                ref={iframeRef}
                                src="/"
                                title="CineGeek Live Preview"
                                onLoad={handleIframeLoad}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    background: '#09090b'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL SALVAR COMO NOVO TEMA */}
            {isNewThemeModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 99999,
                    padding: '1rem'
                }}>
                    <div style={{
                        background: '#13131a',
                        border: '1px solid #27272a',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '440px',
                        padding: '1.8rem',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
                    }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: '800', color: '#fff' }}>
                            Novo Snapshot de Tema
                        </h3>
                        <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', color: '#a1a1aa' }}>
                            Salve este estado de CSS e HTML modificado como um tema independente na sua biblioteca.
                        </p>

                        <form onSubmit={handleCreateNewTheme} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input
                                type="text"
                                placeholder="Ex: Halloween 2026, Natal Neon, Tema Escuro..."
                                value={newThemeNameInput}
                                onChange={(e) => setNewThemeNameInput(e.target.value)}
                                autoFocus
                                required
                                style={{
                                    padding: '12px 16px',
                                    background: '#1c1c24',
                                    border: '1px solid #3f3f46',
                                    borderRadius: '12px',
                                    color: '#fff',
                                    fontSize: '0.95rem',
                                    outline: 'none'
                                }}
                            />

                            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsNewThemeModalOpen(false)}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        background: '#27272a',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        background: 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)',
                                        color: '#000',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 16px rgba(0, 230, 118, 0.4)'
                                    }}
                                >
                                    {saving ? 'Criando...' : 'Criar Tema'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
