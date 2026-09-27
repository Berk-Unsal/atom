export function ToolSection({ actions = null, children, className = "", description = "", title }) {
  return (
    <section className={`tool-section ${className}`.trim()}>
      {title || description || actions ? (
        <header className="tool-section-heading">
          <div>
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function KeyValueRows({ items, label, className = "" }) {
  return (
    <dl className={`tool-key-values ${className}`.trim()} aria-label={label}>
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value ?? "Not recorded"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SubviewSwitcher({ activeId, items, label, onChange }) {
  return (
    <div className="tool-subview-switcher" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          aria-pressed={activeId === item.id}
          className={activeId === item.id ? "active" : ""}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ToolEmptyState({ action = null, description, title }) {
  return (
    <div className="tool-empty-state" role="status">
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function TechnicalDetails({ children, summary = "Details / Provenance", className = "" }) {
  return (
    <details className={`tool-technical-details ${className}`.trim()}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
