export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div style={{
      textAlign: 'center', padding: '56px 24px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px dashed var(--surface-border)',
      borderRadius: '12px'
    }}>
      {Icon && (
        <Icon size={40} style={{ color: 'var(--text-muted)', marginBottom: '16px', opacity: 0.5 }} />
      )}
      <h3 style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 500 }}>{title}</h3>
      {description && <p style={{ fontSize: '0.875rem', maxWidth: '320px', margin: '0 auto 20px' }}>{description}</p>}
      {action}
    </div>
  );
}
