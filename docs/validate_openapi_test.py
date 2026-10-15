import copy
import unittest

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


if __name__ == "__main__":
    unittest.main()
