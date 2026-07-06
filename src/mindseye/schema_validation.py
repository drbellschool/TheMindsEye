from __future__ import annotations

import json
import re
from typing import Any


class SchemaValidationError(ValueError):
    """Raised when JSON data violates the supported schema contract."""


def validate_json_schema(instance: Any, schema: Any, path: str = "$") -> None:
    """Validate data against the JSON Schema subset used by town packages."""
    _validate(instance, schema, path)


def _validate(instance: Any, schema: Any, path: str) -> None:
    if schema is True:
        return
    if schema is False:
        raise SchemaValidationError(f"{path} is not allowed")
    if not isinstance(schema, dict):
        raise SchemaValidationError(f"{path} has invalid schema definition")

    if "allOf" in schema:
        for subschema in schema["allOf"]:
            _validate(instance, subschema, path)

    if "anyOf" in schema and not any(_matches(instance, subschema) for subschema in schema["anyOf"]):
        raise SchemaValidationError(f"{path} must match at least one allowed schema")

    if "oneOf" in schema:
        match_count = sum(1 for subschema in schema["oneOf"] if _matches(instance, subschema))
        if match_count != 1:
            raise SchemaValidationError(f"{path} must match exactly one allowed schema")

    if "not" in schema and _matches(instance, schema["not"]):
        raise SchemaValidationError(f"{path} must not match disallowed schema")

    if "if" in schema:
        if _matches(instance, schema["if"]):
            if "then" in schema:
                _validate(instance, schema["then"], path)
        elif "else" in schema:
            _validate(instance, schema["else"], path)

    if "const" in schema and instance != schema["const"]:
        raise SchemaValidationError(f"{path} must be {schema['const']!r}")

    if "enum" in schema and instance not in schema["enum"]:
        raise SchemaValidationError(f"{path} must be one of {schema['enum']!r}")

    if "type" in schema:
        expected = schema["type"]
        if not _matches_type(instance, expected):
            raise SchemaValidationError(f"{path} must be {_type_label(expected)}")

    if isinstance(instance, dict):
        _validate_object(instance, schema, path)
    if isinstance(instance, list):
        _validate_array(instance, schema, path)
    if isinstance(instance, str):
        _validate_string(instance, schema, path)
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        _validate_number(instance, schema, path)


def _validate_object(instance: dict[str, Any], schema: dict[str, Any], path: str) -> None:
    for key in schema.get("required", []):
        if key not in instance:
            raise SchemaValidationError(f"{path} missing required key: {key}")

    properties = schema.get("properties", {})
    if isinstance(properties, dict):
        for key, subschema in properties.items():
            if key in instance:
                _validate(instance[key], subschema, f"{path}.{key}")

    additional = schema.get("additionalProperties", True)
    if additional is False and isinstance(properties, dict):
        extra = sorted(set(instance) - set(properties))
        if extra:
            raise SchemaValidationError(f"{path} has unsupported key: {extra[0]}")
    elif isinstance(additional, dict) and isinstance(properties, dict):
        for key in sorted(set(instance) - set(properties)):
            _validate(instance[key], additional, f"{path}.{key}")


def _validate_array(instance: list[Any], schema: dict[str, Any], path: str) -> None:
    if "minItems" in schema and len(instance) < schema["minItems"]:
        raise SchemaValidationError(f"{path} must contain at least {schema['minItems']} item")
    if "maxItems" in schema and len(instance) > schema["maxItems"]:
        raise SchemaValidationError(f"{path} must contain at most {schema['maxItems']} items")
    if schema.get("uniqueItems"):
        seen: set[str] = set()
        for index, item in enumerate(instance):
            marker = json.dumps(item, sort_keys=True)
            if marker in seen:
                raise SchemaValidationError(f"{path}[{index}] duplicates an earlier item")
            seen.add(marker)

    items_schema = schema.get("items")
    if items_schema is not None:
        for index, item in enumerate(instance):
            _validate(item, items_schema, f"{path}[{index}]")


def _validate_string(instance: str, schema: dict[str, Any], path: str) -> None:
    if "minLength" in schema and len(instance) < schema["minLength"]:
        raise SchemaValidationError(f"{path} must contain at least {schema['minLength']} character")
    if "maxLength" in schema and len(instance) > schema["maxLength"]:
        raise SchemaValidationError(f"{path} must contain at most {schema['maxLength']} characters")
    if "pattern" in schema and re.search(schema["pattern"], instance) is None:
        raise SchemaValidationError(f"{path} must match pattern {schema['pattern']!r}")


def _validate_number(instance: int | float, schema: dict[str, Any], path: str) -> None:
    if "minimum" in schema and instance < schema["minimum"]:
        raise SchemaValidationError(f"{path} must be at least {schema['minimum']}")
    if "maximum" in schema and instance > schema["maximum"]:
        raise SchemaValidationError(f"{path} must be at most {schema['maximum']}")


def _matches(instance: Any, schema: Any) -> bool:
    try:
        _validate(instance, schema, "$")
    except SchemaValidationError:
        return False
    return True


def _matches_type(instance: Any, expected: str | list[str]) -> bool:
    if isinstance(expected, list):
        return any(_matches_type(instance, item) for item in expected)

    if expected == "object":
        return isinstance(instance, dict)
    if expected == "array":
        return isinstance(instance, list)
    if expected == "string":
        return isinstance(instance, str)
    if expected == "integer":
        return isinstance(instance, int) and not isinstance(instance, bool)
    if expected == "number":
        return isinstance(instance, (int, float)) and not isinstance(instance, bool)
    if expected == "boolean":
        return isinstance(instance, bool)
    if expected == "null":
        return instance is None
    return False


def _type_label(expected: str | list[str]) -> str:
    if isinstance(expected, list):
        return " or ".join(expected)
    return expected
