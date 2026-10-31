# scripts/ — API integration skill scripts

This directory contains the deterministic check scripts for the `dev-api-integration` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `contract_validate.py` | Contract validation: compare request/response samples with the contract schema field set | 0/2/3 |
| `mock_server.py` | Generate a mock service configuration from the contract (JSON Server style) | 0/3 |
| `idempotency_test.py` | Idempotency test: check that repeated requests return identical results | 0/2/3 |

---

## contract_validate.py

### Purpose
Checks that an interface contract and an actual sample have consistent fields. Reads the contract JSON (lists the required request/response fields) and the sample JSON (actual request/response field values), and outputs the missing fields and the match result.

### Interface
```
python contract_validate.py <contract_json> <sample_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `contract_json` | Path to the contract JSON, format `{"request": ["field_name"], "response": ["field_name"]}` |
| `sample_json` | Path to the sample JSON, format `{"request": {...}, "response": {...}}` |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | All contract fields are present in the sample (match=true) |
| 2 | The sample is missing fields declared in the contract (match=false) |
| 3 | Argument error (file not found / JSON parse failure) |

### Checks
1. **Contract field extraction**: extract the required field names from the `request` and `response` arrays of contract_json.
2. **Sample field comparison**: check whether the sample's `request`/`response` objects contain all contract fields.
3. **Missing field output**: list `missing_request_fields` and `missing_response_fields` separately.
4. **match decision**: match=true when both missing lists are empty.

### Input JSON example
Contract (contract.json):
```json
{
  "request": ["customer_id", "amount", "currency"],
  "response": ["txn_id", "status", "txn_time"]
}
```
Sample (sample.json):
```json
{
  "request": {"customer_id": "C001", "amount": 100.00, "currency": "CNY"},
  "response": {"txn_id": "T20260811001", "status": "SUCCESS", "txn_time": "2026-08-11T10:00:00+08:00"}
}
```

### Output JSON example
```json
{
  "missing_request_fields": [],
  "missing_response_fields": [],
  "match": true
}
```

### Usage examples
```bash
# Basic validation (contract vs sample)
python skills/dev-api-integration/scripts/contract_validate.py contract.json sample.json

# Missing field case (sample lacks the amount field)
python skills/dev-api-integration/scripts/contract_validate.py contract.json incomplete_sample.json

# CI gate (driven by exit code)
python skills/dev-api-integration/scripts/contract_validate.py contract.json sample.json && echo "Contract validation passed" || echo "Contract validation failed"
```

### Unit tests
The `dev-api-integration/contract_validate.py` entry in `tests/test_scripts.py` (3 cases):
- `match`: contract and sample fields match → exit=0, output contains `match`
- `missing_field`: sample lacks field `c` → exit=2, output contains `missing_request_fields`
- `missing_file`: sample file does not exist → exit=3, output contains `error`

---

## mock_server.py

### Purpose
Generates a mock service configuration (JSON Server style) from the contract JSON. Reads the routes list in the contract and outputs a route configuration that a mock service can consume directly.

### Interface
```
python mock_server.py <contract_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `contract_json` | Path to the contract JSON, format `{"routes": [{"path": "/api/x", "method": "GET", "response": {...}}]}` |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Mock configuration generated (empty routes also count as success) |
| 3 | Argument error (file not found / JSON parse failure) |

### Checks
1. **Route extraction**: extract path/method/response from each entry of the contract's `routes` array.
2. **Default method**: `GET` when no method is declared.
3. **Default response**: an empty object `{}` when no response is declared.
4. **Empty contract handling**: when the contract has no routes field, output an empty routes list (exit=0).

### Input JSON example
```json
{
  "routes": [
    {"path": "/api/transfer", "method": "POST", "response": {"txn_id": "T001", "status": "SUCCESS"}},
    {"path": "/api/balance", "method": "GET", "response": {"balance": 1000.00}}
  ]
}
```

### Output JSON example
```json
{
  "routes": [
    {"path": "/api/transfer", "method": "POST", "response": {"txn_id": "T001", "status": "SUCCESS"}},
    {"path": "/api/balance", "method": "GET", "response": {"balance": 1000.00}}
  ]
}
```

### Usage examples
```bash
# Generate mock configuration from the contract
python skills/dev-api-integration/scripts/mock_server.py contract.json

# Empty contract case (outputs empty routes)
python skills/dev-api-integration/scripts/mock_server.py empty_contract.json

# Start the mock with json-server
python skills/dev-api-integration/scripts/mock_server.py contract.json > mock_routes.json && json-server mock_routes.json
```

### Unit tests
The `dev-api-integration/mock_server.py` entry in `tests/test_scripts.py` (3 cases):
- `routes`: contract with 1 route → exit=0, output contains `routes`
- `empty_contract`: contract is an empty object → exit=0, output contains `routes`
- `missing_file`: file does not exist → exit=3, output contains `error`

---

## idempotency_test.py

### Purpose
Idempotency test: checks whether the server returns identical responses when the same request is submitted repeatedly. Input is a JSON list of the responses to the repeated request; output is the request count and the idempotency verdict.

### Interface
```
python idempotency_test.py <responses_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `responses_json` | JSON list of responses to the repeated request, format `[{...}, {...}, ...]` |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | All responses are identical (idempotent=true), including an empty list |
| 2 | Responses differ (idempotent=false) |
| 3 | Argument error (file not found / JSON parse failure) |

### Checks
1. **Response consistency**: compare every response object in the list with the first response.
2. **Empty list handling**: an empty array counts as idempotent=true.
3. **Request count output**: the `requests` field gives the number of responses compared.

### Input JSON example
```json
[
  {"code": 0, "txn_id": "T001", "status": "SUCCESS"},
  {"code": 0, "txn_id": "T001", "status": "SUCCESS"}
]
```

### Output JSON example
```json
{
  "requests": 2,
  "idempotent": true
}
```

### Usage examples
```bash
# Idempotency passes (both responses identical)
python skills/dev-api-integration/scripts/idempotency_test.py identical_responses.json

# Idempotency fails (responses differ)
python skills/dev-api-integration/scripts/idempotency_test.py different_responses.json

# CI gate (duplicate submission must be idempotent)
python skills/dev-api-integration/scripts/idempotency_test.py responses.json && echo "Idempotency passed" || echo "Idempotency failed"
```

### Unit tests
The `dev-api-integration/idempotency_test.py` entry in `tests/test_scripts.py` (3 cases):
- `identical`: both responses identical → exit=0, output contains `idempotent`
- `different`: the two responses differ → exit=2, output contains `idempotent`
- `missing_file`: file does not exist → exit=3, output contains `error`

---

## Limits

- These scripts are **lightweight deterministic checks**; they do not replace real integration and load testing.
- `contract_validate.py` only **compares field sets**. It does not check field types, enum values, lengths or business rules; deep validation needs an OpenAPI 3.0 validator (such as schemathesis).
- `mock_server.py` only generates the route configuration and **does not start a mock service**; use it with a mock framework such as json-server.
- `idempotency_test.py` only compares whether response contents are identical and **does not verify the idempotency key mechanism itself**; the idempotency key design and validity period must be checked in code review.
- At L3, idempotency of fund-related interfaces must additionally cover concurrent duplicate submission and duplicate submission across nodes.
