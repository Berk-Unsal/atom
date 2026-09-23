import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import LazyFeatureBoundary from "./LazyFeatureBoundary.jsx";
import ResearchReferenceBadge from "./ResearchReferenceBadge.jsx";

export default function DisclosureSection({
  attention = false,
  attentionMessage = "Settings need attention",
  children,
  className = "",
  count = 0,
  countLabel = "configured",
  defaultOpen = false,
  description,
  focusInvalid = false,
  lazyFeature = null,
  openRequest = 0,
  research = false,
  status = "",
  title,
}) {
  const contentId = useId();
  const descriptionId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const [manuallyOpen, setManuallyOpen] = useState(defaultOpen);
  const [hasEverOpened, setHasEverOpened] = useState(defaultOpen);
  const [acknowledgedOpenRequest, setAcknowledgedOpenRequest] = useState(0);
  const requestOpen = openRequest > acknowledgedOpenRequest;
  const open = attention || manuallyOpen || requestOpen;

  useEffect(() => {
    if (requestOpen) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [openRequest, requestOpen]);

  useEffect(() => {
    if (attention && focusInvalid && open) rootRef.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [attention, focusInvalid, open]);

  const toggle = () => {
    if (open && attention) {
      rootRef.current?.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    if (requestOpen) {
      setHasEverOpened(true);
      setAcknowledgedOpenRequest(openRequest);
      setManuallyOpen(false);
      return;
    }
    if (!open) setHasEverOpened(true);
    setManuallyOpen(!open);
  };

  const accessibleName = attention ? `${title}, ${attentionMessage}` : title;

  return (
    <section
      ref={rootRef}
      className={`disclosure-section ${open ? "is-open" : ""} ${attention ? "has-attention" : ""} ${className}`.trim()}
    >
      <h3 className="disclosure-heading">
        <button
          ref={triggerRef}
          type="button"
          className="disclosure-trigger"
          aria-label={accessibleName}
          aria-controls={contentId}
          aria-describedby={description ? descriptionId : undefined}
          aria-expanded={open}
          onClick={toggle}
        >
          <ChevronDown className="disclosure-chevron" size={15} aria-hidden="true" />
          <span className="disclosure-title">{title}</span>
          {research && !/^research \/ reference$/i.test(title) ? <ResearchReferenceBadge label="Research / reference" /> : null}
          {attention ? <span className="disclosure-attention" role="status">{attentionMessage}</span> : null}
          {!attention && count > 0 ? <span className="disclosure-status">{research ? "Research activity available" : `Advanced · ${count} ${countLabel}`}</span> : null}
          {!attention && count === 0 && status ? <span className="disclosure-status">{status}</span> : null}
        </button>
      </h3>
      {description ? <p className="disclosure-description" id={descriptionId}>{description}</p> : null}
      <div className="disclosure-content" id={contentId} hidden={!open}>
        {lazyFeature
          ? hasEverOpened || open
            ? <LazyFeatureBoundary {...lazyFeature} active />
            : null
          : children}
      </div>
    </section>
  );
}
