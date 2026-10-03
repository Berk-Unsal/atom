import { useEffect, useRef } from "react";

export default function ResultTabs({ onChange, value, views }) {
  const rootRef = useRef(null);
  useEffect(() => {
    rootRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);
  return (
    <div ref={rootRef} className="result-view-tabs" role="tablist" aria-label="Result views">
      {views.map((view, index) => (
        <button key={view.id} type="button" role="tab" aria-selected={value === view.id} tabIndex={value === view.id ? 0 : -1} className={value === view.id ? "active" : ""} onClick={() => onChange(view.id)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length;
          rootRef.current.querySelectorAll("button")[next]?.focus();
          onChange(views[next].id);
        }}>{view.label}</button>
      ))}
    </div>
  );
}
