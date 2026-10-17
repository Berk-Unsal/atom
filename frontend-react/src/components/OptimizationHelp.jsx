export function OptimizationScoreHelp() {
  return (
    <details className="advanced-settings optimization-help">
      <summary>About this score</summary>
      <div className="optimization-help-content">
        <p>The /100 score is a normalized, preference-weighted utility: how well this configuration meets your current priorities. Available objectives are put on a common scale so different units can be combined using their relative importance.</p>
        <p>It is not a coverage percentage, measured field accuracy, probability, or confidence.</p>
        <p>Higher served demand, covered residential buildings and propagation reach are preferred; lower overlap is preferred. When evaluated, Radio quality rewards a higher serviceable sample fraction. Unavailable objectives are excluded from scoring.</p>
        <p>Network optimization varies Cell azimuths. Other configured RF and site inputs stay fixed for that search.</p>
      </div>
    </details>
  );
}

export function ParetoAlternativesHelp() {
  return (
    <details className="advanced-settings optimization-help">
      <summary>How to compare and use alternatives</summary>
      <div className="optimization-help-content">
        <p>Non-dominated means no retained option is at least as good on every available objective and better on one. Your priorities determine which trade-off receives the highest score.</p>
        <p aria-label="Illustrative Pareto trade-off"><strong>Illustrative example, not current results:</strong> A serves more demand with more overlap; B serves less demand with less overlap. With other objectives equal, neither is better on all objectives. More importance on Demand can favor A; more on Reduce overlap can favor B.</p>
        <ul>
          <li><strong>Inspect:</strong> view a retained option’s metrics and azimuths without an RF request. The map remains from the last simulation.</li>
          <li><strong>Rerank:</strong> change Optimization priorities to rescore and reorder retained alternatives locally. No new RF request or search; the recommendation can change without applying it.</li>
          <li><strong>Apply solution…:</strong> review the source and destination, then explicitly create a new Version or branch with the chosen azimuths. The source stays unchanged; run the new plan separately for fresh RF maps. If the optimization ran on an unsaved working draft, its exact starting plan is saved as a Version first.</li>
          <li><strong>New search:</strong> Optimize Network starts a new backend optimization search and RF computation using the configured inputs. It can discover different alternatives. The returned azimuths update the working plan and map.</li>
        </ul>
      </div>
    </details>
  );
}
