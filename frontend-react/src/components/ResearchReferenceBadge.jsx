export default function ResearchReferenceBadge({ label = "Research profile" }) {
  return <span className="research-reference-label" aria-label={label}>{label}</span>;
}
