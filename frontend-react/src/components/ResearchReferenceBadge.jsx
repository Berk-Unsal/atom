export default function ResearchReferenceBadge({ label = "Research / reference" }) {
  return <span className="research-reference-label" aria-label={label}>{label}</span>;
}
