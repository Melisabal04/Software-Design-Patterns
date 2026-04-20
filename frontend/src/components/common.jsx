export function AppShell({ title, subtitle, accent = "peach", children, actions }) {
  return (
    <div className={`app-shell accent-${accent}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Restway Panel</p>
          <h1>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        <div className="topbar-actions">{actions}</div>
      </header>

      <main className="page-grid">{children}</main>
    </div>
  );
}

export function PanelCard({ title, hint, children, className = "" }) {
  return (
    <section className={`panel-card ${className}`}>
      {(title || hint) && (
        <div className="panel-card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {hint ? <p className="panel-hint">{hint}</p> : null}
          </div>
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, tone = "default" }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

export function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

export function ActionButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
}) {
  return (
    <button type={type} className={`action-button ${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function NumberInput({ value, onChange, min = 1 }) {
  return (
    <input
      className="text-input"
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function TextInput({ value, onChange, placeholder = "" }) {
  return (
    <input
      className="text-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

export function SelectInput({ value, onChange, options }) {
  return (
    <select className="text-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Money({ amount }) {
  const numeric = Number(amount || 0);
  return <>{numeric.toFixed(2)} ₺</>;
}

export function NavPills() {
  return (
    <div className="nav-pills">
      <a href="/customer" className="nav-pill">Customer</a>
      <a href="/kitchen" className="nav-pill">Kitchen</a>
      <a href="/waiter" className="nav-pill">Waiter</a>
    </div>
  );
}