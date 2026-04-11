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
  const { socket } = useSocket();
  const admin = isAdmin(user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data);
      if (activeConv && !res.data.find(c => c.id === activeConv.id)) {
        setActiveConv(null); // Conversation was deleted
      }
    } catch (_) { } finally {
      setLoadingConvs(false);
    }
  }, [activeConv]);

  const fetchUsers = useCallback(async () => {
    if (!users.length) {
      try {
        const res = await api.get('/users/basic');
        setUsers(res.data);
      } catch (_) { }
    }
  }, [users.length]);

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

  useEffect(() => {
    if (!activeConv || !socket) return;
    socket.emit('join_conversation', activeConv.id);

    const onNewMessage = (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      fetchConversations();
    };

    const onMsgDeleted = ({ id }) => {
      setMessages(prev => prev.map(m => m.id == id ? { ...m, content: '[Message deleted]', deleted_at: new Date().toISOString() } : m));
    };

    const onMsgUpdated = (msgUpdate) => {
      setMessages(prev => prev.map(m => m.id == msgUpdate.id ? { ...m, ...msgUpdate } : m));
    };

    const onMemberAdded = (member) => {
      setActiveConv(prev => prev ? { ...prev, members: [...prev.members.filter(m => m.id !== member.id), member] } : prev);
      fetchConversations();
    };

    const onMemberRemoved = ({ user_id }) => {
      setActiveConv(prev => {
        if (!prev) return prev;
        if (parseInt(user_id) === parseInt(user.id)) return null; // You were removed
        return { ...prev, members: prev.members.filter(m => parseInt(m.id) !== parseInt(user_id)) };
      });
      fetchConversations();
    };

    socket.on('new_message', onNewMessage);
    socket.on('message_deleted', onMsgDeleted);
    socket.on('message_updated', onMsgUpdated);
    socket.on('member_added', onMemberAdded);
    socket.on('member_removed', onMemberRemoved);

    return () => {
      socket.emit('leave_conversation', activeConv.id);
      socket.off('new_message');
      socket.off('message_deleted');
      socket.off('message_updated');
      socket.off('member_added');
      socket.off('member_removed');
    };
  }, [activeConv, socket, fetchConversations, user.id]);

  useEffect(() => { scrollToBottom(); }, [messages]);

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
      await fetchConversations();
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

  const convIcon = (type) => ({ public: <Hash size={16} />, private: <Lock size={16} />, group: <Users size={16} /> }[type] || <Hash size={16} />);
  const convName = (conv) => {
    if (conv.type === 'public') return conv.name || 'General';
    if (conv.type === 'group') return conv.name || 'Group';
    const other = conv.members?.find(m => parseInt(m.id) !== parseInt(user.id));
    return other?.name || 'Direct Message';
  };

  const isConvAdmin = activeConv && parseInt(activeConv.created_by) === parseInt(user.id);
  const pinnedMessages = messages.filter(m => m.is_pinned && (!m.pin_expires_at || new Date(m.pin_expires_at) > new Date()));

  return (
    <div style={{ display: 'flex', height: 'calc(100dvh - var(--header-height, 52px) - 40px)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--surface-border)', overflow: 'hidden', position: 'relative' }}>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileSidebarOpen && (
        <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10, display: 'block' }} className="mobile-only" />
      )}

      {/* ── Conversation Sidebar ── */}
      <div className={`chat-sidebar ${mobileSidebarOpen ? 'open' : ''}`} style={{
        width: '280px', flexShrink: 0, borderRight: '1px solid var(--surface-border)',
        display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)'
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Messages</span>
          <button onClick={() => { fetchUsers(); setNewConvModal(true); }} className="btn" style={{ background: 'var(--accent-glow)', border: 'none', padding: '6px', color: 'var(--accent-base)', borderRadius: '8px' }}>
            <Plus size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? <div style={{ padding: '20px', textAlign: 'center' }} className="loading-spinner" /> : (
            conversations.map(conv => {
              const isActive = activeConv?.id === conv.id;
              return (
                <div key={conv.id} onClick={() => selectConv(conv)} style={{
                  padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: isActive ? 'var(--accent-glow)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent-base)' : '3px solid transparent',
                  transition: 'background 0.2s', display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: isActive ? 'var(--accent-base)' : 'var(--text-muted)' }}>{convIcon(conv.type)}</span>
                    <strong style={{ fontSize: '0.875rem', fontWeight: 600, color: isActive ? 'var(--text-primary)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        {!activeConv ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hidden-mobile">
            <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a conversation or start a new one." />
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn mobile-only" onClick={() => setMobileSidebarOpen(true)} style={{ padding: '6px', border: 'none', background: 'transparent' }}><Menu size={20} /></button>
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--accent-glow)', color: 'var(--accent-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {convIcon(activeConv.type)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{convName(activeConv)}</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeConv.members?.length || 0} participants</p>
                </div>
              </div>
              <button className="btn" onClick={() => { fetchUsers(); setShowInfoModal(true); }} style={{ padding: '6px', border: 'transparent', background: 'transparent' }}>
                <MoreVertical size={18} />
              </button>
            </div>

            {/* Pinned Messages */}
            {pinnedMessages.length > 0 && (
              <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--surface-border)', background: 'var(--accent-subtle)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {loadingMsgs ? <div className="loading-spinner" /> : (
                messages.map((msg, i) => {
                  const isMe = parseInt(msg.user_id) === parseInt(user.id);
                  const isDeleted = !!msg.deleted_at;
                  const prevMsg = messages[i - 1];
                  const sameAuthor = prevMsg && parseInt(prevMsg.user_id) === parseInt(msg.user_id) && !msg.reply_to_id;

                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: '10px', marginTop: sameAuthor ? '2px' : '16px' }}>
                      {!isMe && !sameAuthor && (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0, marginTop: msg.reply_to_id ? '22px' : '0' }}>
                          {msg.abbreviation || msg.user_name?.charAt(0)}
                        </div>
                      )}
                      {!isMe && sameAuthor && <div style={{ width: 32, flexShrink: 0 }} />}

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                        {!isMe && !sameAuthor && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', marginLeft: '4px' }}>{msg.user_name}</span>}

                        <div className="msg-bubble-wrap" style={{ position: 'relative' }}>
                          <div style={{
                            padding: '10px 14px',
                            background: isMe ? 'var(--accent-base)' : 'var(--surface-primary)',
                            color: isDeleted ? 'var(--text-muted)' : (isMe ? '#fff' : 'var(--text-primary)'),
                            borderRadius: isMe
                              ? (sameAuthor ? '14px 4px 4px 14px' : '14px 14px 4px 14px')
                              : (sameAuthor ? '4px 14px 14px 4px' : '14px 14px 14px 4px'),
                            fontStyle: isDeleted ? 'italic' : 'normal',
                            fontSize: '0.9rem',
                            lineHeight: 1.5,
                            border: msg.is_important ? `1px solid ${isMe ? 'rgba(255,255,255,0.4)' : 'var(--warning-color)'}` : '1px solid transparent',
                            boxShadow: 'var(--shadow-sm)'
                          }}>
                            {msg.reply_content && (
                              <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', marginBottom: '8px', borderLeft: '3px solid rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>
                                <strong style={{ display: 'block', color: isMe ? 'rgba(255,255,255,0.8)' : 'var(--accent-base)' }}>{msg.reply_user_name}</strong>
                                <span style={{ opacity: 0.8 }}>{msg.reply_content.length > 50 ? msg.reply_content.substring(0, 50) + '...' : msg.reply_content}</span>
                              </div>
                            )}
                            {msg.content}
                            {msg.is_important && <Star size={12} style={{ display: 'inline', marginLeft: '6px', color: isMe ? '#fff' : 'var(--warning-color)' }} />}
                          </div>

                          {!isDeleted && (
                            <div className="msg-actions" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [isMe ? 'left' : 'right']: '-80px', display: 'none', gap: '4px', background: 'var(--surface-color)', padding: '4px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                              <button onClick={() => { setReplyingTo(msg); inputRef.current?.focus(); }} className="btn" style={{ padding: '4px', border: 'none' }} title="Reply"><Reply size={14} /></button>
                              <button onClick={() => handleImportant(msg)} className="btn" style={{ padding: '4px', border: 'none', color: msg.is_important ? 'var(--warning-color)' : '' }} title="Important"><Star size={14} /></button>
                              {(isMe || admin) && <button onClick={() => handleDeleteMessage(msg.id)} className="btn" style={{ padding: '4px', border: 'none', color: 'var(--danger-color)' }}><Trash2 size={14} /></button>}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', padding: '0 4px' }}>{timeAgo(msg.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ background: 'var(--bg-primary)', borderTop: '1px solid var(--surface-border)', padding: '16px 20px', zIndex: 2 }}>
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-primary)', borderRadius: '8px 8px 0 0', border: '1px solid var(--surface-border)', borderBottom: 'none' }}>
                  <div style={{ fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--accent-base)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><Reply size={12} /> Replying to {replyingTo.user_name}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{replyingTo.content.substring(0, 60)}{replyingTo.content.length > 60 ? '...' : ''}</span>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="btn" style={{ border: 'none', background: 'transparent', padding: '4px' }}><X size={16} /></button>
                </div>
              )}
              <form onSubmit={sendMessage} style={{ display: 'flex', gap: '12px' }}>
                <input
                  ref={inputRef}
                  className="input"
                  style={{ flex: 1, borderRadius: replyingTo ? '0 0 12px 12px' : '12px', padding: '12px 16px', background: 'var(--surface-color)' }}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Type a message..."
                  autoComplete="off"
                />
                <button type="submit" className="btn btn-primary" style={{ borderRadius: '12px', width: '48px', height: '48px', padding: 0 }} disabled={!input.trim()}>
                  <Send size={18} />
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
        .hidden-mobile { display: flex; }
        .mobile-only { display: none; }
        @media (max-width: 768px) {
          .chat-sidebar { position: absolute; left: 0; top: 0; bottom: 0; z-index: 20; transform: translateX(-100%); }
          .chat-sidebar.open { transform: translateX(0); }
          .hidden-mobile { display: none !important; }
          .mobile-only { display: inline-flex; }
        }
      `}} />
    </div>
  );
}
