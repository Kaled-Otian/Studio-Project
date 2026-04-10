import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, maxWidth = '560px' }) {
  const overlayRef = useRef();

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', overflowY: 'auto'
      }}
    >
      <div
        className="glass"
        style={{
          width: '100%', maxWidth, background: 'rgba(15,23,42,0.95)',
          borderRadius: '16px', overflow: 'hidden',
          animation: 'modalIn 0.2s ease',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid var(--surface-border)'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                     color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
