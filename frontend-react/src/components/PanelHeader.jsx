import { X } from "lucide-react";

export default function PanelHeader({ children, closeLabel, headingRef, id, onClose, subtitle, title, className = "" }) {
  return (
    <header className={`panel-header ${className}`.trim()}>
      {children}
      <div className="panel-header-copy">
        <h2 id={id} ref={headingRef} tabIndex={-1}>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <button type="button" className="drawer-icon-button drawer-close" onClick={onClose} aria-label={closeLabel}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
}
