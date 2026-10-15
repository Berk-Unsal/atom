#!/usr/bin/env python3
"""Validate the actual OpenAPI 3.1 contract, including Response Objects and refs."""

from pathlib import Path

import yaml
from openapi_spec_validator import OpenAPIV31SpecValidator


def openapi_errors(specification):
    if not isinstance(specification, dict) or specification.get("openapi") != "3.1.0":
        return ["expected an OpenAPI 3.1.0 document"]
    try:
        return [
            f"{'/'.join(map(str, error.path)) or '<root>'}: {error.message}"
            for error in OpenAPIV31SpecValidator(specification).iter_errors()
        ]
    except Exception as error:
        # Reference-resolution failures can be raised while traversing the schema.
        # They must fail the gate rather than hiding behind successful YAML parsing.
        return [f"OpenAPI validation/reference resolution failed: {error}"]


def main():
    specification = yaml.safe_load(Path(__file__).with_name("openapi.yaml").read_text())
    if errors := openapi_errors(specification):
        raise SystemExit("\n".join(errors))
    print(f"strict OpenAPI 3.1 valid: {len(specification['paths'])} paths")


if __name__ == "__main__":
    main()
