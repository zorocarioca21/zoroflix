import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Send, Reply, ThumbsUp, ThumbsDown, AlertTriangle, Trash2, Crown, ShieldCheck, EyeOff, Image as ImageIcon, Loader } from 'lucide-react';

export default function CommentSection({ contentId, mediaType, episodeId }) {
    const { user } = useAuth();
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploadingSticker, setUploadingSticker] = useState(false);
    const fileInputRef = React.useRef(null);

    useEffect(() => {
        fetchComments();
    }, [contentId, episodeId]);

    const fetchComments = async () => {
        try {
            const url = `/api/comments/${mediaType}/${contentId}${episodeId ? `?episodeId=${episodeId}` : ''}`;
            const resp = await fetch(url);
            const data = await resp.json();
            
            // Organizar em Threads (Pai -> Filhos)
            const parents = data.filter(c => !c.parent_id);
            const children = data.filter(c => c.parent_id);
            
            const threads = parents.map(p => ({
                ...p,
                replies: children.filter(c => c.parent_id === p.id).reverse()
            }));

            setComments(threads);
        } catch (err) {
            console.error("Erro ao carregar comentários", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (parentId = null) => {
        if (!user) return alert("Você precisa estar logado para comentar.");
        const text = parentId ? replyingTo?.text : newComment;
        if (!text?.trim()) return;

        try {
            const resp = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    parentId,
                    contentId,
                    mediaType,
                    episodeId,
                    text
                })
            });

            if (resp.ok) {
                setNewComment('');
                setReplyingTo(null);
                fetchComments();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleStickerUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !user) return;

        setUploadingSticker(true);
        try {
            const token = localStorage.getItem('cinegeek_token');
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/storage/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                setNewComment(prev => prev + ` [STICKER:${data.url}]`);
            } else {
                alert("Erro ao enviar figurinha.");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setUploadingSticker(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const renderCommentText = (text) => {
        if (!text) return null;
        const stickerRegex = /\[STICKER:(\/s\/\d+)\]/g;
        if (!text.match(stickerRegex)) return text;
        
        const parts = text.split(stickerRegex);
        return parts.map((part, i) => {
            if (part.startsWith('/s/')) {
                return <img key={i} src={part} alt="Sticker" className="comment-sticker" />;
            }
            return <span key={i}>{part}</span>;
        });
    };

    const handleReact = async (commentId, type) => {
        if (!user) return alert("Faça login para reagir.");
        try {
            await fetch('/api/comments/react', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, commentId, type })
            });
            fetchComments();
        } catch (err) { console.error(err); }
    };

    const handleReport = async (commentId) => {
        if (!user) return;
        const reason = prompt("Por que você quer denunciar este comentário?");
        if (!reason) return;

        try {
            await fetch('/api/comments/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, commentId, reason })
            });
            alert("Denúncia enviada com sucesso.");
        } catch (err) { console.error(err); }
    };

    const handleDeleteADM = async (commentId) => {
        if (!window.confirm("Apagar comentário (Aviso de moderado)?")) return;
        try {
            const resp = await fetch(`/api/admin/comments/${commentId}/moderation`, { 
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'moderated' })
            });
            if (resp.ok) fetchComments();
        } catch (err) { console.error(err); }
    };

    const handleHideADM = async (commentId) => {
        if (!window.confirm("Esconder comentário completamente?")) return;
        try {
            const resp = await fetch(`/api/admin/comments/${commentId}/moderation`, { 
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'hidden' })
            });
            if (resp.ok) fetchComments();
        } catch (err) { console.error(err); }
    };

    return (
        <div className="comments-section-wrap">
            <h3>Comentários ({comments.length})</h3>

            {user ? (
                <div className="comment-input-box">
                    <img 
                        src={user.avatar && !user.avatar.includes('zorobot.shop') ? user.avatar : '/default-avatar.svg'} 
                        alt="" 
                        className="comment-avatar-small" 
                        onError={(e) => { e.target.onerror = null; e.target.src = '/default-avatar.svg'; }} 
                    />
                    <textarea 
                        placeholder="O que achou deste conteúdo?"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                    ></textarea>
                    
                    <input type="file" ref={fileInputRef} accept="image/*" style={{display: 'none'}} onChange={handleStickerUpload} />
                    
                    <button className="comment-sticker-btn" onClick={() => fileInputRef.current?.click()} disabled={uploadingSticker} title="Anexar Imagem ou GIF">
                        {uploadingSticker ? <Loader size={18} className="spin" /> : <ImageIcon size={18} />}
                    </button>

                    <button className="comment-send-btn" onClick={() => handleSend()}>
                        <Send size={18} />
                    </button>
                </div>
            ) : (
                <div className="comment-locked">Faça login para participar da conversa.</div>
            )}

            <div className="comments-list">
                {comments.map((c) => {
                    const isDeleted = c.text === '[Comentário apagado por um Administrador]';
                    return (
                        <div key={c.id} className={`comment-item ${isDeleted ? 'deleted-by-adm' : ''}`}>
                            <div className="comment-main">
                            <div className={`avatar-wrapper-role role-${c.role}`}>
                                <img src={c.avatar && !c.avatar.includes('zorobot.shop') ? c.avatar : '/default-avatar.svg'} alt="" className="comment-avatar" onError={(e) => { e.target.onerror = null; e.target.src = '/default-avatar.svg'; }} />
                            </div>
                            <div className="comment-content">
                                <div className="comment-meta">
                                    <span className={`comment-author role-${c.role}`}>
                                        {c.nick}
                                        {c.role === 'admin' && <span className="badge-admin"><ShieldCheck size={12}/> ADMIN</span>}
                                        {c.role === 'vip' && <Crown size={14} className="icon-crown" />}
                                    </span>
                                    <span className="comment-date">{new Date(c.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="comment-text">{renderCommentText(c.text)}</div>
                                <div className="comment-actions">
                                    <button onClick={() => !isDeleted && handleReact(c.id, 'like')} disabled={isDeleted}>
                                        <ThumbsUp size={14} /> {c.likes}
                                    </button>
                                    <button onClick={() => !isDeleted && handleReact(c.id, 'dislike')} disabled={isDeleted}>
                                        <ThumbsDown size={14} /> {c.dislikes}
                                    </button>
                                    <button onClick={() => !isDeleted && setReplyingTo({ id: c.id, nick: c.nick, text: '' })} disabled={isDeleted}>
                                        <Reply size={14} /> Responder
                                    </button>
                                    <button className="btn-report" onClick={() => !isDeleted && handleReport(c.id)} disabled={isDeleted}>
                                        <AlertTriangle size={14} /> Denunciar
                                    </button>
                                    {user?.role === 'admin' && !isDeleted && (
                                        <div className="admin-quick-actions">
                                            <button className="btn-delete-adm warn" onClick={() => handleDeleteADM(c.id)} title="Apagar (Avisar)">
                                                <Trash2 size={14} />
                                            </button>
                                            <button className="btn-delete-adm hide" onClick={() => handleHideADM(c.id)} title="Esconder (Sumir)">
                                                <EyeOff size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Thread de Respostas */}
                        {c.replies.length > 0 && (
                            <div className="comment-replies">
                                {c.replies.map(r => (
                                    <div key={r.id} className="comment-item reply">
                                        <div className={`avatar-wrapper-role role-${r.role} mini`}>
                                            <img src={r.avatar && !r.avatar.includes('zorobot.shop') ? r.avatar : '/default-avatar.svg'} alt="" className="comment-avatar-mini" onError={(e) => { e.target.onerror = null; e.target.src = '/default-avatar.svg'; }} />
                                        </div>
                                        <div className="comment-content">
                                            <div className="comment-meta">
                                                <span className={`comment-author role-${r.role}`}>
                                                    {r.nick}
                                                    {r.role === 'admin' && <span className="badge-admin mini"><ShieldCheck size={10}/></span>}
                                                    {r.role === 'vip' && <Crown size={12} className="icon-crown" />}
                                                </span>
                                                <span className="comment-date">{new Date(r.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <div className="comment-text">{renderCommentText(r.text)}</div>
                                            {user?.role === 'admin' && (
                                                <div className="admin-quick-actions mini">
                                                    <button className="btn-delete-adm mini warn" onClick={() => handleDeleteADM(r.id)}>
                                                        <Trash2 size={12} />
                                                    </button>
                                                    <button className="btn-delete-adm mini hide" onClick={() => handleHideADM(r.id)}>
                                                        <EyeOff size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Input de Resposta */}
                        {replyingTo?.id === c.id && (
                            <div className="reply-box">
                                <textarea 
                                    placeholder={`Respondendo para ${c.nick}...`}
                                    value={replyingTo.text}
                                    onChange={(e) => setReplyingTo({...replyingTo, text: e.target.value})}
                                ></textarea>
                                <div className="reply-btns">
                                    <button onClick={() => setReplyingTo(null)}>Cancelar</button>
                                    <button onClick={() => handleSend(c.id)}>Responder</button>
                                </div>
                            </div>
                        )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
