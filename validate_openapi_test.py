import copy
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator
import yaml

from validate_openapi import openapi_errors


def contract():
    return {
        "openapi": "3.1.0",
        "info": {"title": "Contract regression fixture", "version": "1"},
        "paths": {"/example": {"get": {"responses": {"200": {
            "description": "A documented response",
            "content": {"application/json": {"schema": {"type": "object"}}},
        }}}}},
    }


class StrictOpenAPIRegressionTests(unittest.TestCase):
    def test_valid_contract(self):
        self.assertEqual(openapi_errors(contract()), [])

    def test_invalid_response_objects_and_schema_placement(self):
        for invalid in [
            {"description": "Build", "model": None},
            {"description": "Result", "schema": {"type": "object"}},
            {"description": "Result", "content": {"application/json": {"type": "object"}}},
            [],
            {"content": {"application/json": {"schema": {"type": "object"}}}},
        ]:
            with self.subTest(response=invalid):
                specification = copy.deepcopy(contract())
                specification["paths"]["/example"]["get"]["responses"]["200"] = invalid
                self.assertTrue(openapi_errors(specification))

    def test_unresolved_reference_is_rejected(self):
        for location in ['response', 'schema']:
            with self.subTest(location=location):
                specification = contract()
                responses = specification["paths"]["/example"]["get"]["responses"]
                if location == 'response':
                    responses["200"] = {"$ref": "#/components/responses/Missing"}
                else:
                    responses["200"]["content"]["application/json"]["schema"] = {
                        "$ref": "#/components/schemas/Missing",
                    }
                self.assertTrue(openapi_errors(specification))

    def test_non_response_mapping_is_rejected(self):
        specification = contract()
        specification["paths"]["/example"]["get"]["responses"] = []
        self.assertTrue(openapi_errors(specification))


class OperationalResponseContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        docs = Path(__file__).resolve().parent
        cls.specification = yaml.safe_load((docs / "openapi.yaml").read_text())
        # Go tests compare these same snapshots to real handler outputs.
        cls.fixtures = json.loads(
            (docs.parent / "backend-go/testdata/operational-responses.json").read_text()
        )

    def validator(self, fixture):
        schema = self.specification["paths"][fixture["path"]]["get"]["responses"][
            str(fixture["status"])
        ]["content"]["application/json"]["schema"]
        # Keep component references rooted in the actual OpenAPI document.
        return Draft202012Validator({
            **schema, "components": self.specification["components"],
        })

    def test_handler_response_fixtures(self):
        self.assertEqual(
            {(fixture["path"], fixture["status"]) for fixture in self.fixtures},
            {("/readyz", 200), ("/readyz", 503),
             ("/api/processes/batch-experiment", 200)},
        )
        for fixture in self.fixtures:
            with self.subTest(fixture=fixture["name"]):
                self.validator(fixture).validate(fixture["body"])

    def test_required_response_values(self):
        for fixture in self.fixtures:
            validator = self.validator(fixture)
            for field, value in fixture["body"].items():
                with self.subTest(fixture=fixture["name"], field=field, mutation="missing"):
                    invalid = copy.deepcopy(fixture["body"])
                    del invalid[field]
                    self.assertFalse(validator.is_valid(invalid))
                # Include null as well as a non-null wrong type for every field.
                wrong_type = "true" if isinstance(value, bool) else {}
                for replacement in (None, wrong_type):
                    with self.subTest(fixture=fixture["name"], field=field,
                                      replacement=replacement):
                        invalid = copy.deepcopy(fixture["body"])
                        invalid[field] = replacement
                        self.assertFalse(validator.is_valid(invalid))

    def test_readiness_status_flags_and_sanitized_errors(self):
        for fixture in self.fixtures:
            if fixture["path"] != "/readyz":
                continue
            validator = self.validator(fixture)
            invalid_values = {
                "status": ["ok", "not_ready" if fixture["status"] == 200 else "ready"],
                "dataset_error": ["/private/data/manifest.json: checksum mismatch", " "],
            }
            if fixture["status"] == 200:
                invalid_values.update({field: [False] for field in
                                       ("buildings", "towers", "frontend")})
            for field, values in invalid_values.items():
                for value in values:
                    with self.subTest(fixture=fixture["name"], field=field, value=value):
                        invalid = copy.deepcopy(fixture["body"])
                        invalid[field] = value
                        self.assertFalse(validator.is_valid(invalid))
            if fixture["status"] == 503:
                with self.subTest(fixture=fixture["name"], mutation="all assets ready"):
                    invalid = {**fixture["body"], "buildings": True,
                               "towers": True, "frontend": True}
                    self.assertFalse(validator.is_valid(invalid))

    def test_batch_discovery_values_and_array_items(self):
        fixture = next(fixture for fixture in self.fixtures
                       if fixture["path"] == "/api/processes/batch-experiment")
        validator = self.validator(fixture)
        invalid_values = {
            "id": ["other-process"],
            "version": ["2.0.0"],
            "max_runs": [0, 63, 65, 64.5, True, "64"],
        }
        for field in ("job_control_options", "dimensions"):
            values = fixture["body"][field]
            invalid_values[field] = [
                [], values[:-1], values + [values[0]],
                ["unknown"] + values[1:], [1] + values[1:],
            ]
        for field, values in invalid_values.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    invalid = copy.deepcopy(fixture["body"])
                    invalid[field] = value
                    self.assertFalse(validator.is_valid(invalid))


if __name__ == "__main__":
    unittest.main()
