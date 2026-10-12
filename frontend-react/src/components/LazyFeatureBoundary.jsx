import { Component, useEffect, useState } from "react";

export default function LazyFeatureBoundary({
  active = true,
  componentKey,
  componentProps = {},
  featureName = "Feature",
  load,
}) {
  const [Feature, setFeature] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!active || Feature) return undefined;
    let current = true;
    Promise.resolve()
      .then(load)
      .then((module) => {
        if (typeof module?.default !== "function") throw new TypeError(`${featureName} has no default feature component`);
        if (current) {
          setFeature(() => module.default);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (current) setLoadError(error);
      });
    return () => { current = false; };
  }, [active, Feature, featureName, load]);

  if (!active && !Feature) return null;
  if (loadError && !Feature) {
    return <FeatureLoadError featureName={featureName} />;
  }
  if (!Feature) {
    return (
      <div className="lazy-feature-loading" role="status" aria-live="polite" aria-busy="true">
        Loading {featureName}…
      </div>
    );
  }

  return (
    <FeatureRenderErrorBoundary
      featureName={featureName}
    >
      <Feature key={componentKey} {...componentProps} />
    </FeatureRenderErrorBoundary>
  );
}

function FeatureLoadError({ featureName }) {
  return (
    <section className="lazy-feature-error" role="alert" aria-label={`${featureName} could not be loaded`}>
      <strong>{featureName} could not be loaded.</strong>
      <p>The workspace is still available. Reload the application to retry loading this feature.</p>
      <div className="lazy-feature-error-actions">
        <button type="button" onClick={() => window.location.reload()}>Reload application</button>
      </div>
    </section>
  );
}

class FeatureRenderErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <FeatureLoadError featureName={this.props.featureName} />;
  }
}
