import { useState, useEffect, useRef, useCallback } from 'react';
import { api, useAuth } from '../context/AuthContext';
import { Send, Plus, Hash, Lock, Users, Star, Pin, Trash2, X, MessageSquare } from 'lucide-react';
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
  const [lastMessageTime, setLastMessageTime] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const { socket } = useSocket();
  const admin = isAdmin(user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Fetch conversation list
  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data);
    } catch (_) {}  finally {
      setLoadingConvs(false);
    }
  }, []);

  // Fetch all users for new conversation
  const fetchUsers = useCallback(async () => {
    if (!users.length) {
      try {
        const res = await api.get('/users/basic');
        setUsers(res.data);
      } catch (_) {}
    }
  }, [users.length]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Initial message load for active conversation
  const loadMessages = useCallback(async (convId) => {
    setLoadingMsgs(true);
    try {
      const res = await api.get(`/chat/conversations/${convId}/messages?limit=60`);
      setMessages(res.data);
      if (res.data.length > 0) {
        setLastMessageTime(res.data[res.data.length - 1].created_at);
      }
    } catch (_) {} finally {
      setLoadingMsgs(false);
    }
  }, []);

  // Switch conversation
  const selectConv = useCallback((conv) => {
    setActiveConv(conv);
    setMessages([]);
    setLastMessageTime(null);
    setMobileSidebarOpen(false);
    loadMessages(conv.id);
  }, [loadMessages]);

  // WebSockets for Real-Time Updates
  useEffect(() => {
    if (!activeConv || !socket) return;

    socket.emit('join_conversation', activeConv.id);

    const onNewMessage = (msg) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      fetchConversations();
    };

    const onMsgDeleted = ({ id }) => {
      setMessages(prev => prev.map(m => m.id == id ? { ...m, content: '[Message deleted]', deleted_at: new Date().toISOString() } : m));
    };

    const onMsgUpdated = (msgUpdate) => {
      setMessages(prev => prev.map(m => m.id == msgUpdate.id ? { ...m, ...msgUpdate } : m));
    };

    const onMemberAdded = (member) => {
      setActiveConv(prev => {
        if (!prev) return prev;
        return { ...prev, members: [...prev.members.filter(m => m.id !== member.id), member] };
      });
      fetchConversations();
    };

    const onMemberRemoved = ({ user_id }) => {
      setActiveConv(prev => {
        if (!prev) return prev;
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
      socket.off('new_message', onNewMessage);
      socket.off('message_deleted', onMsgDeleted);
      socket.off('message_updated', onMsgUpdated);
      socket.off('member_added', onMemberAdded);
      socket.off('member_removed', onMemberRemoved);
    };
  }, [activeConv, socket, fetchConversations]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeConv) return;
    const text = input.trim();
    setInput('');
    try {
      const res = await api.post(`/chat/conversations/${activeConv.id}/messages`, { content: text });
      setMessages(prev => [...prev, res.data]);
      setLastMessageTime(res.data.created_at);
      fetchConversations(); // refresh last_message preview
    } catch {
      toast.error('Failed to send message');
      setInput(text);
    }
  };

  const handlePin = async (msg) => {
    try {
      await api.patch(`/chat/messages/${msg.id}`, { is_pinned: !msg.is_pinned, pin_duration_hours: 24 });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: msg.is_pinned ? 0 : 1 } : m));
    } catch { toast.error('Failed to pin'); }
  };

  const handleImportant = async (msg) => {
    try {
      await api.patch(`/chat/messages/${msg.id}`, { is_important: !msg.is_important });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_important: msg.is_important ? 0 : 1 } : m));
    } catch { toast.error('Failed to mark'); }
  };

  const handleDeleteMessage = async (msgId) => {
    try {
      await api.delete(`/chat/messages/${msgId}`);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '[Message deleted]', deleted_at: new Date().toISOString() } : m));
    } catch { toast.error('Failed to delete'); }
  };

  const toggleInvisible = async () => {
    try {
      const amIInvisible = activeConv.members?.some(m => parseInt(m.id) === parseInt(user.id) && m.is_invisible);
      await api.patch(`/chat/conversations/${activeConv.id}/invisible`, { is_invisible: !amIInvisible });
      toast.success(amIInvisible ? 'You are now visible' : 'You are now invisible');
      fetchConversations();
    } catch { toast.error('Failed to toggle visibility'); }
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

  const handleCreateConversation = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/chat/conversations', { ...newConvForm, member_ids: newConvForm.member_ids.map(Number) });
      toast.success(res.data.existing ? 'Opening existing conversation' : 'Conversation created!');
      setNewConvModal(false);
      setNewConvForm({ type: 'private', name: '', member_ids: [] });
      await fetchConversations();
      // Auto-select the new/existing conversation
      const updatedList = await api.get('/chat/conversations');
      setConversations(updatedList.data);
      const conv = updatedList.data.find(c => c.id === (res.data.id || res.data.existing));
      if (conv) selectConv(conv);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create conversation');
    }
  };

  const convIcon = (type) => ({ public: <Hash size={16}/>, private: <Lock size={16}/>, group: <Users size={16}/> }[type] || <Hash size={16}/>);
  const convName = (conv) => {
    if (conv.type === 'public') return conv.name || 'General';
    if (conv.type === 'group') return conv.name || 'Group';
    const other = conv.members?.find(m => parseInt(m.id) !== parseInt(user.id));
    return other?.name || 'Direct Message';
  };

  const pinnedMessages = messages.filter(m => m.is_pinned && (!m.pin_expires_at || new Date(m.pin_expires_at) > new Date()));

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 110px)', gap: '0', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--surface-border)', overflow: 'hidden' }}>

      {/* ── Conversation Sidebar ───────────────────────────────────────────── */}
      <div style={{
        width: '280px', flexShrink: 0, borderRight: '1px solid var(--surface-border)',
        display: 'flex', flexDirection: 'column',
        ...(mobileSidebarOpen ? { position: 'absolute', zIndex: 10, height: '100%', background: 'rgba(11,17,32,0.98)' } : {})
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Messages</span>
          <button onClick={() => { fetchUsers(); setNewConvModal(true); }} style={{ background: 'var(--accent-glow)', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: 'var(--accent-base)' }}><Plus size={16}/></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div> : (
            conversations.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No conversations yet. Start one!</div>
            ) : (
              conversations.map(conv => {
                const isActive = activeConv?.id === conv.id;
                return (
                  <div key={conv.id} onClick={() => selectConv(conv)} style={{
                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: isActive ? 'var(--accent-glow)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--accent-base)' : '3px solid transparent',
                    transition: 'all 0.15s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ color: isActive ? 'var(--accent-base)' : 'var(--text-muted)', flexShrink: 0 }}>{convIcon(conv.type)}</span>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem', color: isActive ? 'var(--text-primary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convName(conv)}</span>
                    </div>
                    {conv.last_message && (
                      <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.last_sender}: {conv.last_message}
                      </p>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* ── Chat Area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!activeConv ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a conversation from the left or start a new one." />
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--accent-base)' }}>{convIcon(activeConv.type)}</span>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>{convName(activeConv)}</strong>
                  <p style={{ margin: 0, fontSize: '0.75rem' }}>{activeConv.members?.length || 0} member{(activeConv.members?.length !== 1) ? 's' : ''}</p>
                </div>
              </div>
              <button className="btn" onClick={() => { fetchUsers(); setShowInfoModal(true); }} style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)' }}>
                View Info
              </button>
            </div>

            {/* Pinned messages */}
            {pinnedMessages.length > 0 && (
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--surface-border)', background: 'rgba(200,114,18,0.06)' }}>
                {pinnedMessages.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <Pin size={12} color="var(--accent-base)" /> <strong style={{ color: 'var(--text-primary)' }}>{m.user_name}:</strong> {m.content}
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {loadingMsgs ? <div className="loading-spinner"></div> : (
                messages.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <EmptyState icon={MessageSquare} title="No messages yet" description="Be the first to say something!" />
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isMe = parseInt(msg.user_id) === parseInt(user.id);
                    const prevMsg = messages[i - 1];
                    const sameAuthor = prevMsg && parseInt(prevMsg.user_id) === parseInt(msg.user_id) &&
                      (new Date(msg.created_at) - new Date(prevMsg.created_at)) < 120000;
                    const isDeleted = !!msg.deleted_at;

                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-end', marginTop: sameAuthor ? '2px' : '14px' }}>
                        {!isMe && !sameAuthor && (
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                            {msg.abbreviation || msg.user_name?.charAt(0)}
                          </div>
                        )}
                        {!isMe && sameAuthor && <div style={{ width: 32, flexShrink: 0 }} />}
                        <div style={{ maxWidth: '65%' }}>
                          {!sameAuthor && !isMe && <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{msg.user_name}</p>}
                          <div style={{ position: 'relative' }} className="msg-bubble-wrap">
                            <div style={{
                              padding: '8px 14px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                              background: isMe ? 'var(--accent-base)' : 'rgba(255,255,255,0.07)',
                              color: isDeleted ? 'var(--text-muted)' : 'var(--text-primary)',
                              fontStyle: isDeleted ? 'italic' : 'normal',
                              fontSize: '0.875rem', lineHeight: 1.5,
                              border: msg.is_important ? `1px solid ${isMe ? 'rgba(255,255,255,0.3)' : 'var(--warning-color)'}` : 'none',
                              boxShadow: msg.is_pinned ? '0 0 0 2px var(--accent-base)' : 'none'
                            }}>
                              {msg.content}
                              {msg.is_important && <Star size={11} style={{ marginLeft: '6px', verticalAlign: 'middle', color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--warning-color)' }} />}
                              {msg.is_pinned && <Pin size={11} style={{ marginLeft: '4px', verticalAlign: 'middle', color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--accent-base)' }} />}
                            </div>
                            {/* Hover actions */}
                            {!isDeleted && (
                              <div className="msg-actions" style={{ position: 'absolute', top: '-28px', [isMe ? 'left' : 'right']: 0, display: 'none', gap: '4px', background: 'rgba(15,23,42,0.95)', borderRadius: '6px', padding: '4px', border: '1px solid var(--surface-border)' }}>
                                <button onClick={() => handleImportant(msg)} title="Mark important" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: msg.is_important ? 'var(--warning-color)' : 'var(--text-muted)', borderRadius: '4px' }}><Star size={13}/></button>
                                <button onClick={() => handlePin(msg)} title="Pin message" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: msg.is_pinned ? 'var(--accent-base)' : 'var(--text-muted)', borderRadius: '4px' }}><Pin size={13}/></button>
                                {(isMe || admin) && <button onClick={() => handleDeleteMessage(msg.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: 'var(--danger-color)', borderRadius: '4px' }}><Trash2 size={13}/></button>}
                              </div>
                            )}
                          </div>
                          <p style={{ margin: '3px 4px 0', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: isMe ? 'right' : 'left' }}>{timeAgo(msg.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} style={{ padding: '12px 16px', borderTop: '1px solid var(--surface-border)', display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.02)' }}>
              <input
                className="input"
                style={{ flex: 1, borderRadius: '20px', padding: '10px 16px' }}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Message ${convName(activeConv)}...`}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-primary" style={{ borderRadius: '20px', padding: '10px 16px', flexShrink: 0 }} disabled={!input.trim()}>
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>

      {/* New Conversation Modal */}
      <Modal open={newConvModal} onClose={() => setNewConvModal(false)} title="New Conversation" maxWidth="480px">
        <form onSubmit={handleCreateConversation} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Type</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['private', Lock, 'Private'], ['group', Users, 'Group']].map(([val, Icon, label]) => (
                <button type="button" key={val} onClick={() => setNewConvForm(f => ({ ...f, type: val }))} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${newConvForm.type === val ? 'var(--accent-base)' : 'var(--surface-border)'}`, background: newConvForm.type === val ? 'var(--accent-glow)' : 'transparent', color: newConvForm.type === val ? 'var(--accent-base)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.875rem', fontWeight: 500 }}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
          </div>
          {newConvForm.type === 'group' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Group Name</label>
              <input className="input" value={newConvForm.name} onChange={e => setNewConvForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Editing Team" />
            </div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label>{newConvForm.type === 'private' ? 'Select User' : 'Add Members'}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
              {users.filter(u => parseInt(u.id) !== parseInt(user.id)).map(u => {
                const sel = newConvForm.member_ids.includes(u.id) || newConvForm.member_ids.includes(String(u.id));
                return (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', background: sel ? 'var(--accent-glow)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', border: `1px solid ${sel ? 'var(--accent-base)' : 'transparent'}`, transition: 'all 0.15s' }}>
                    <input type={newConvForm.type === 'private' ? 'radio' : 'checkbox'} name="members" style={{ display: 'none' }} checked={sel} onChange={() => {
                      if (newConvForm.type === 'private') {
                        setNewConvForm(f => ({ ...f, member_ids: [u.id] }));
                      } else {
                        setNewConvForm(f => ({ ...f, member_ids: sel ? f.member_ids.filter(id => String(id) !== String(u.id)) : [...f.member_ids, u.id] }));
                      }
                    }} />
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>{u.abbreviation || u.name.charAt(0)}</div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{u.name}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem' }}>{u.job_title || u.role}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={!newConvForm.member_ids.length}>Start Chat</button>
            <button type="button" className="btn" onClick={() => setNewConvModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
      {/* Chat Info Modal */}
      <Modal open={showInfoModal} onClose={() => setShowInfoModal(false)} title="Conversation Details" maxWidth="450px">
        {activeConv && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={16}/> Members ({activeConv.members?.length || 0})</h4>
                {isSuperAdmin && (
                  <button onClick={toggleInvisible} className="btn" style={{ fontSize: '0.75rem', padding: '4px 8px', background: activeConv.members?.some(m => parseInt(m.id) === parseInt(user.id) && m.is_invisible) ? 'var(--accent-base)' : 'transparent', border: '1px solid var(--surface-border)' }}>
                    {activeConv.members?.some(m => parseInt(m.id) === parseInt(user.id) && m.is_invisible) ? 'Invisible Mode ON' : 'Go Invisible'}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                {activeConv.members?.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>{m.abbreviation || m.name.charAt(0)}</div>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500 }}>{m.name} {parseInt(m.id) === parseInt(user.id) && '(You)'}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{m.user_role}</p>
                      </div>
                    </div>
                    {isSuperAdmin && parseInt(m.id) !== parseInt(user.id) && (
                      <button onClick={() => handleRemoveMember(m.id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: '4px' }} title="Remove user"><X size={14}/></button>
                    )}
                  </div>
                ))}
              </div>

              {isSuperAdmin && activeConv.type !== 'private' && (
                <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <select className="input" style={{ flex: 1, padding: '8px' }} value={addMemberId} onChange={e => setAddMemberId(e.target.value)}>
                    <option value="">— Add a user —</option>
                    {users.filter(u => !activeConv.members?.some(m => parseInt(m.id) === parseInt(u.id))).map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                  <button className="btn btn-primary" type="submit" disabled={!addMemberId}>Add</button>
                </form>
              )}
            </div>
            <button className="btn" onClick={() => setShowInfoModal(false)}>Close</button>
          </div>
        )}
      </Modal>

    </div>
  );
}
