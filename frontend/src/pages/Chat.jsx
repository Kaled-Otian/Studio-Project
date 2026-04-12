import { useState, useEffect, useRef, useCallback } from 'react';
import { api, useAuth } from '../context/AuthContext';
import { Send, Plus, Hash, Lock, Users, Star, Pin, Trash2, X, MessageSquare, Reply, Menu, MoreVertical, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { timeAgo, isAdmin } from '../lib/roles';
import { useSocket } from '../context/SocketContext';

export default function Chat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newConvModal, setNewConvModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [addMemberId, setAddMemberId] = useState('');
  const [newConvForm, setNewConvForm] = useState({ type: 'private', name: '', member_ids: [] });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const activeConvRef = useRef(null);
  const { socket } = useSocket();
  const admin = isAdmin(user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Keep ref in sync so socket callbacks always see current activeConv
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data);
    } catch (_) { } finally {
      setLoadingConvs(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users/basic');
      setUsers(res.data);
    } catch (_) { }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const loadMessages = useCallback(async (convId) => {
    setLoadingMsgs(true);
    try {
      const res = await api.get(`/chat/conversations/${convId}/messages?limit=60`);
      setMessages(res.data);
    } catch (_) { } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const selectConv = useCallback((conv) => {
    setActiveConv(conv);
    setMessages([]);
    setReplyingTo(null);
    setMobileSidebarOpen(false);
    loadMessages(conv.id);
  }, [loadMessages]);

  // ── Socket event handling ──────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg) => {
      const current = activeConvRef.current;
      if (current && msg.conversation_id === current.id) {
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      }
      fetchConversations();
    };

    const onMsgDeleted = ({ id }) => {
      setMessages(prev => prev.map(m => m.id == id ? { ...m, content: '[Message deleted]', deleted_at: new Date().toISOString() } : m));
    };

    const onMsgUpdated = (msgUpdate) => {
      setMessages(prev => prev.map(m => m.id == msgUpdate.id ? { ...m, ...msgUpdate } : m));
    };

    const onMemberAdded = (member) => {
      setActiveConv(prev => prev ? { ...prev, members: [...(prev.members || []).filter(m => m.id !== member.id), member] } : prev);
      fetchConversations();
    };

    const onMemberRemoved = ({ user_id: removedId }) => {
      setActiveConv(prev => {
        if (!prev) return prev;
        if (parseInt(removedId) === parseInt(user.id)) return null;
        return { ...prev, members: (prev.members || []).filter(m => parseInt(m.id) !== parseInt(removedId)) };
      });
      fetchConversations();
    };

    socket.on('new_message', onNewMessage);
    socket.on('message_deleted', onMsgDeleted);
    socket.on('message_updated', onMsgUpdated);
    socket.on('member_added', onMemberAdded);
    socket.on('member_removed', onMemberRemoved);

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('message_deleted', onMsgDeleted);
      socket.off('message_updated', onMsgUpdated);
      socket.off('member_added', onMemberAdded);
      socket.off('member_removed', onMemberRemoved);
    };
  }, [socket, fetchConversations, user.id]);

  // ── Join/leave conversation room ───────────────────────────────────────

  useEffect(() => {
    if (!activeConv || !socket) return;
    socket.emit('join_conversation', activeConv.id);
    return () => { socket.emit('leave_conversation', activeConv.id); };
  }, [activeConv?.id, socket]);

  // ── Auto-scroll on new messages ────────────────────────────────────────

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── Actions ────────────────────────────────────────────────────────────

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeConv) return;
    const text = input.trim();
    const replyId = replyingTo?.id;
    setInput('');
    setReplyingTo(null);
    try {
      const res = await api.post(`/chat/conversations/${activeConv.id}/messages`, { content: text, reply_to_id: replyId });
      setMessages(prev => [...prev.filter(m => m.id !== res.data.id), res.data]);
      fetchConversations();
    } catch {
      toast.error('Failed to send message');
      setInput(text);
    }
  };

  const handleImportant = async (msg) => {
    try {
      await api.patch(`/chat/messages/${msg.id}`, { is_important: !msg.is_important });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_important: msg.is_important ? 0 : 1 } : m));
    } catch { toast.error('Failed to mark important'); }
  };

  const handlePin = async (msg) => {
    try {
      await api.patch(`/chat/messages/${msg.id}`, { is_pinned: !msg.is_pinned, pin_duration_hours: 24 });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: msg.is_pinned ? 0 : 1 } : m));
    } catch { toast.error('Failed to pin'); }
  };

  const handleDeleteMessage = async (msgId) => {
    try {
      await api.delete(`/chat/messages/${msgId}`);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '[Message deleted]', deleted_at: new Date().toISOString() } : m));
    } catch { toast.error('Failed to delete message'); }
  };

  const handleCreateConversation = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/chat/conversations', { ...newConvForm, member_ids: newConvForm.member_ids.map(Number) });
      toast.success(res.data.existing ? 'Opened existing chat' : 'Chat created!');
      setNewConvModal(false);
      setNewConvForm({ type: 'private', name: '', member_ids: [] });
      const updatedList = await api.get('/chat/conversations');
      setConversations(updatedList.data);
      const conv = updatedList.data.find(c => c.id === (res.data.id || res.data.existing));
      if (conv) selectConv(conv);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create conversation'); }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!addMemberId) return;
    try {
      await api.post(`/chat/conversations/${activeConv.id}/members`, { user_id: addMemberId });
      toast.success('Member added');
      setAddMemberId('');
      fetchConversations();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add member'); }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await api.delete(`/chat/conversations/${activeConv.id}/members/${userId}`);
      toast.success('Member removed');
      fetchConversations();
    } catch { toast.error('Failed to remove member'); }
  };

  const handleLeaveConversation = async () => {
    if (!window.confirm("Are you sure you want to leave this conversation?")) return;
    try {
      await api.delete(`/chat/conversations/${activeConv.id}/leave`);
      setActiveConv(null);
      fetchConversations();
    } catch { toast.error('Failed to leave'); }
  };

  const handleDeleteConversation = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this entire conversation?")) return;
    try {
      await api.delete(`/chat/conversations/${activeConv.id}`);
      setActiveConv(null);
      fetchConversations();
      setShowInfoModal(false);
    } catch { toast.error('Failed to delete conversation'); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  const convIcon = (type) => ({ public: <Hash size={16} />, private: <Lock size={16} />, group: <Users size={16} /> }[type] || <Hash size={16} />);
  const convName = (conv) => {
    if (conv.type === 'public') return conv.name || 'General';
    if (conv.type === 'group') return conv.name || 'Group';
    const other = conv.members?.find(m => parseInt(m.id) !== parseInt(user.id));
    return other?.name || 'Direct Message';
  };

  const isConvAdmin = activeConv && parseInt(activeConv.created_by) === parseInt(user.id);
  const pinnedMessages = messages.filter(m => m.is_pinned && (!m.pin_expires_at || new Date(m.pin_expires_at) > new Date()));

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="chat-root" style={{ display: 'flex', flex: 1, width: '100%', minHeight: 0, background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--surface-border)', overflow: 'hidden', position: 'relative' }}>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileSidebarOpen && (
        <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 15 }} />
      )}

      {/* ── Conversation Sidebar ── */}
      <div className={`chat-sidebar ${mobileSidebarOpen ? 'chat-sidebar--open' : ''}`} style={{
        width: '280px', flexShrink: 0, borderRight: '1px solid var(--surface-border)',
        display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)'
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Messages</span>
          <button onClick={() => { fetchUsers(); setNewConvModal(true); }} className="btn" style={{ background: 'var(--accent-glow)', border: 'none', padding: '6px', color: 'var(--accent-base)', borderRadius: '8px' }}>
            <Plus size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loadingConvs ? <div style={{ padding: '20px', textAlign: 'center' }} className="loading-spinner" /> : (
            conversations.map(conv => {
              const isActive = activeConv?.id === conv.id;
              return (
                <div key={conv.id} onClick={() => selectConv(conv)} style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: isActive ? 'var(--accent-glow)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent-base)' : '3px solid transparent',
                  transition: 'background 0.2s', display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: isActive ? 'var(--accent-base)' : 'var(--text-muted)', flexShrink: 0 }}>{convIcon(conv.type)}</span>
                    <strong style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {convName(conv)}
                    </strong>
                  </div>
                  {conv.last_message && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {conv.last_sender}: {conv.last_message}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {!activeConv ? (
          <div className="chat-empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a conversation or start a new one."
              action={
                <button className="btn btn-primary chat-mobile-start-btn" onClick={() => setMobileSidebarOpen(true)} style={{ marginTop: '12px' }}>
                  <Menu size={16} /> Open Messages
                </button>
              }
            />
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button className="btn chat-mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)} style={{ padding: '6px', border: 'none', background: 'transparent' }}><Menu size={20} /></button>
                <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'var(--accent-glow)', color: 'var(--accent-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {convIcon(activeConv.type)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{convName(activeConv)}</h3>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>{activeConv.members?.length || 0} participants</p>
                </div>
              </div>
              <button className="btn" onClick={() => { fetchUsers(); setShowInfoModal(true); }} style={{ padding: '6px', border: 'transparent', background: 'transparent', flexShrink: 0 }}>
                <MoreVertical size={18} />
              </button>
            </div>

            {/* Pinned Messages */}
            {pinnedMessages.length > 0 && (
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--surface-border)', background: 'var(--accent-subtle)', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                {pinnedMessages.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                    <Pin size={12} color="var(--accent-base)" style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: 'var(--accent-base)' }}>{m.user_name}:</span>
                    <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.content}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Messages Feed */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
              {loadingMsgs ? <div className="loading-spinner" /> : (
                messages.map((msg, i) => {
                  const isMe = parseInt(msg.user_id) === parseInt(user.id);
                  const isDeleted = !!msg.deleted_at;
                  const prevMsg = messages[i - 1];
                  const sameAuthor = prevMsg && parseInt(prevMsg.user_id) === parseInt(msg.user_id) && !msg.reply_to_id;

                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: '8px', marginTop: sameAuthor ? '1px' : '12px' }}>
                      {!isMe && !sameAuthor && (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0, marginTop: msg.reply_to_id ? '18px' : '0' }}>
                          {msg.abbreviation || msg.user_name?.charAt(0)}
                        </div>
                      )}
                      {!isMe && sameAuthor && <div style={{ width: 28, flexShrink: 0 }} />}

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%', minWidth: 0 }}>
                        {!isMe && !sameAuthor && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px', marginLeft: '2px' }}>{msg.user_name}</span>}

                        <div className="msg-bubble-wrap" style={{ position: 'relative' }}>
                          <div style={{
                            padding: '8px 12px',
                            background: isMe ? 'var(--accent-base)' : 'var(--surface-primary)',
                            color: isDeleted ? 'var(--text-muted)' : (isMe ? '#fff' : 'var(--text-primary)'),
                            borderRadius: isMe
                              ? (sameAuthor ? '12px 4px 4px 12px' : '12px 12px 4px 12px')
                              : (sameAuthor ? '4px 12px 12px 4px' : '12px 12px 12px 4px'),
                            fontStyle: isDeleted ? 'italic' : 'normal',
                            fontSize: '0.875rem',
                            lineHeight: 1.45,
                            border: msg.is_important ? `1px solid ${isMe ? 'rgba(255,255,255,0.4)' : 'var(--warning-color)'}` : '1px solid transparent',
                            boxShadow: 'var(--shadow-sm)',
                            wordBreak: 'break-word'
                          }}>
                            {msg.reply_content && (
                              <div style={{ padding: '4px 8px', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', marginBottom: '6px', borderLeft: '2px solid rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
                                <strong style={{ display: 'block', color: isMe ? 'rgba(255,255,255,0.8)' : 'var(--accent-base)' }}>{msg.reply_user_name}</strong>
                                <span style={{ opacity: 0.8 }}>{msg.reply_content.length > 50 ? msg.reply_content.substring(0, 50) + '...' : msg.reply_content}</span>
                              </div>
                            )}
                            {msg.content}
                            {msg.is_important && <Star size={10} style={{ display: 'inline', marginLeft: '4px', color: isMe ? '#fff' : 'var(--warning-color)' }} />}
                          </div>

                          {!isDeleted && (
                            <div className="msg-actions" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [isMe ? 'left' : 'right']: '-72px', display: 'none', gap: '2px', background: 'var(--surface-color)', padding: '3px', borderRadius: '6px', border: '1px solid var(--surface-border)' }}>
                              <button onClick={() => { setReplyingTo(msg); inputRef.current?.focus(); }} className="btn" style={{ padding: '3px', border: 'none' }} title="Reply"><Reply size={13} /></button>
                              <button onClick={() => handleImportant(msg)} className="btn" style={{ padding: '3px', border: 'none', color: msg.is_important ? 'var(--warning-color)' : '' }} title="Important"><Star size={13} /></button>
                              {(isMe || admin) && <button onClick={() => handleDeleteMessage(msg.id)} className="btn" style={{ padding: '3px', border: 'none', color: 'var(--danger-color)' }}><Trash2 size={13} /></button>}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', padding: '0 2px' }}>{timeAgo(msg.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area — flex-shrink: 0 keeps it pinned at bottom */}
            <div style={{ background: 'var(--bg-primary)', borderTop: '1px solid var(--surface-border)', padding: '10px 12px', flexShrink: 0 }}>
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--surface-primary)', borderRadius: '8px 8px 0 0', border: '1px solid var(--surface-border)', borderBottom: 'none', marginBottom: '-1px' }}>
                  <div style={{ fontSize: '0.75rem', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ color: 'var(--accent-base)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><Reply size={11} /> Replying to {replyingTo.user_name}</span>
                    <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{replyingTo.content.substring(0, 60)}{replyingTo.content.length > 60 ? '...' : ''}</span>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="btn" style={{ border: 'none', background: 'transparent', padding: '2px', flexShrink: 0 }}><X size={14} /></button>
                </div>
              )}
              <form onSubmit={sendMessage} style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={inputRef}
                  className="input"
                  style={{ flex: 1, borderRadius: replyingTo ? '0 0 10px 10px' : '10px', padding: '10px 14px', background: 'var(--surface-color)' }}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Type a message..."
                  autoComplete="off"
                />
                <button type="submit" className="btn btn-primary" style={{ borderRadius: '10px', width: '42px', height: '42px', padding: 0, flexShrink: 0 }} disabled={!input.trim()}>
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ── Modals ── */}
      <Modal open={newConvModal} onClose={() => setNewConvModal(false)} title="New Conversation" maxWidth="480px">
        <form onSubmit={handleCreateConversation} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Type</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['private', Lock, 'Direct'], ['group', Users, 'Group']].map(([val, Icon, label]) => (
                <button type="button" key={val} onClick={() => setNewConvForm(f => ({ ...f, type: val }))} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${newConvForm.type === val ? 'var(--accent-base)' : 'var(--surface-border)'}`, background: newConvForm.type === val ? 'var(--accent-glow)' : 'transparent', color: newConvForm.type === val ? 'var(--accent-base)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </div>
          {newConvForm.type === 'group' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Group Name</label>
              <input className="input" value={newConvForm.name} onChange={e => setNewConvForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Editors Team" required />
            </div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label>{newConvForm.type === 'private' ? 'Select User' : 'Select Members'}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
              {users.filter(u => parseInt(u.id) !== parseInt(user.id)).map(u => {
                const sel = newConvForm.member_ids.includes(u.id) || newConvForm.member_ids.includes(String(u.id));
                return (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '8px', background: sel ? 'var(--accent-glow)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', border: `1px solid ${sel ? 'var(--accent-base)' : 'transparent'}`, transition: 'all 0.1s' }}>
                    <input type={newConvForm.type === 'private' ? 'radio' : 'checkbox'} name="members" style={{ display: 'none' }} checked={sel} onChange={() => {
                      if (newConvForm.type === 'private') setNewConvForm(f => ({ ...f, member_ids: [u.id] }));
                      else setNewConvForm(f => ({ ...f, member_ids: sel ? f.member_ids.filter(id => String(id) !== String(u.id)) : [...f.member_ids, u.id] }));
                    }} />
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.9rem' }}>{u.abbreviation || u.name.charAt(0)}</div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.job_title || u.role}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!newConvForm.member_ids.length} style={{ padding: '12px' }}>Start Chat</button>
        </form>
      </Modal>

      <Modal open={showInfoModal} onClose={() => setShowInfoModal(false)} title="Chat Settings" maxWidth="450px">
        {activeConv && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'var(--surface-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Users size={16} color="var(--accent-base)" />
                <h4 style={{ margin: 0, fontWeight: 600 }}>Members ({activeConv.members?.length || 0})</h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                {activeConv.members?.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600 }}>{m.abbreviation || m.name.charAt(0)}</div>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{m.name} {parseInt(m.id) === parseInt(user.id) && '(You)'}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{m.user_role}</p>
                      </div>
                    </div>
                    {isSuperAdmin && parseInt(m.id) !== parseInt(user.id) && (
                      <button onClick={() => handleRemoveMember(m.id)} className="btn" style={{ background: 'transparent', border: 'none', color: 'var(--danger-color)', padding: '6px' }} title="Remove"><X size={16} /></button>
                    )}
                  </div>
                ))}
              </div>

              {activeConv.type === 'group' && (isSuperAdmin || isConvAdmin) && (
                <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--surface-border)' }}>
                  <select className="input" style={{ flex: 1, padding: '10px' }} value={addMemberId} onChange={e => setAddMemberId(e.target.value)}>
                    <option value="">— Add Member —</option>
                    {users.filter(u => !activeConv.members?.some(m => parseInt(m.id) === parseInt(u.id))).map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                  <button className="btn btn-primary" type="submit" disabled={!addMemberId} style={{ borderRadius: '8px' }}>Add</button>
                </form>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={handleLeaveConversation} className="btn" style={{ width: '100%', padding: '10px', color: 'var(--warning-color)', borderColor: 'var(--warning-color)', background: 'transparent', justifyContent: 'center' }}>
                <LogOut size={16} /> Leave Conversation
              </button>

              {(isSuperAdmin || isConvAdmin) && (
                <button onClick={handleDeleteConversation} className="btn" style={{ width: '100%', padding: '10px', color: '#fff', background: 'var(--danger-color)', border: 'none', justifyContent: 'center' }}>
                  <Trash2 size={16} /> Delete Conversation
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <style dangerouslySetInnerHTML={{
        __html: `
        .chat-sidebar { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .chat-mobile-menu-btn { display: none; }
        .chat-mobile-start-btn { display: none; }
        .msg-bubble-wrap:hover .msg-actions { display: flex !important; }

        @media (max-width: 768px) {
          .chat-sidebar {
            position: absolute; left: 0; top: 0; bottom: 0; z-index: 20;
            transform: translateX(-100%); width: 280px !important;
            box-shadow: 4px 0 20px rgba(0,0,0,0.3);
          }
          .chat-sidebar.chat-sidebar--open { transform: translateX(0); }
          .chat-mobile-menu-btn { display: inline-flex !important; }
          .chat-mobile-start-btn { display: inline-flex !important; }
          .chat-root { border-radius: 8px !important; }
        }
      `}} />
    </div>
  );
}
