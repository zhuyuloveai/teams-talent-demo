# scripts/ — Integration test skill scripts

This directory contains the deterministic check scripts for the `qa-integration-test` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `interface_contract_test.py` | Automated interface contract test: compare contract fields with interface response samples and detect missing fields | 0/2/3 |
| `data_flow_verify.py` | End-to-end data consistency check: compare the key sets of critical fields in each system's data export | 0/2/3 |

---

## interface_contract_test.py

### Purpose
Runs automated tests on interface contracts. Compares the interface fields defined in the contract JSON with the actual fields in the response sample JSON, detects missing fields (defined in the contract but absent from the response), and outputs the result per interface and the overall pass rate.

### Interface
```
python interface_contract_test.py <contract_json> <responses_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `contract_json` | Path of the contract JSON file, format `{"interfaces": [{"name": "...", "fields": ["f1", "f2"]}]}` |
| `responses_json` | Path of the response JSON file, format `[{"name": "...", "response": {"f1": "v1"}}]` |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | All interface contracts passed (no missing fields) |
| 2 | Contract check failed (some interface has missing fields) |
| 3 | Argument error (file not found / JSON parse failure) |

> Exit code priority: argument error (3) > contract failure (2) > passed (0).

### Checks
1. **JSON parsing**: read and parse the contract JSON and response JSON files; a parse failure returns exit code 3.
2. **Interface matching**: match contract interfaces and response samples by the name field.
3. **Field check**: for each interface, check that all fields defined in the contract exist in the response; missing fields go into missing.
4. **Pass rate**: pass_rate = interfaces passed / total interfaces.
5. **Gate decision**: no interface has missing fields → passed (exit=0); otherwise → failed (exit=2).

### Input JSON format
Contract JSON:
```json
{
  "interfaces": [
    {"name": "transferService", "fields": ["txnId", "amount", "status", "timestamp"]},
    {"name": "accountService", "fields": ["accountId", "balance", "currency"]}
  ]
}
```

Response JSON:
```json
[
  {"name": "transferService", "response": {"txnId": "T001", "amount": 100, "status": "SUCCESS"}},
  {"name": "accountService", "response": {"accountId": "A001", "balance": 5000, "currency": "CNY"}}
]
```

### JSON output example
```json
{
  "results": [
    {"name": "transferService", "missing": ["timestamp"], "pass": false},
    {"name": "accountService", "missing": [], "pass": true}
  ],
  "pass_rate": 0.5
}
```

### Usage examples
```bash
# Basic contract test
python skills/qa-integration-test/scripts/interface_contract_test.py contract.json responses.json

# JSON output (for the Agent)
python skills/qa-integration-test/scripts/interface_contract_test.py contract.json responses.json --json

# CI gate (driven by exit code; passes only when every contract passes)
python skills/qa-integration-test/scripts/interface_contract_test.py contract.json responses.json && echo "Contract test passed" || echo "Contract test failed"
```

### Limits
- Only checks that fields exist; does not check field types or value ranges (use an interface test tool such as Postman / JMeter).
- Interfaces are matched by the name field; the name must be identical in the contract and the response.
- Does not check request fields (only response fields).
- Does not check error codes or timeouts (cover them with interface test cases).

### Unit tests
The `qa-integration-test/interface_contract_test.py` entry in `tests/test_scripts.py` (3 cases):
- `contract_pass`: response fields fully cover the contract → exit=0, pass_rate=1.0
- `contract_fail`: response lacks a field → exit=2, missing is not empty
- `missing_file`: file does not exist → exit=3, output contains `error`

---

## data_flow_verify.py

### Purpose
Checks end-to-end data flow consistency. Takes each system's data export JSON as input, compares whether the key sets of critical fields are identical across systems, and detects fields that are inconsistent across systems. Used as the data flow consistency gate.

### Interface
```
python data_flow_verify.py <systems_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `systems_json` | Path of the system data JSON file, format `{"systemA": [{"key": "k1", "value": "v1"}], "systemB": [{"key": "k1", "value": "v2"}]}` |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Data flow consistent (all systems have the same key set) |
| 2 | Data flow inconsistent (some system has a different key set) |
| 3 | Argument error (file not found / JSON parse failure) |

> Exit code priority: argument error (3) > inconsistent (2) > consistent (0).

### Checks
1. **JSON parsing**: read and parse the system data JSON file; a parse failure returns exit code 3.
2. **Key set extraction**: for each system, extract the key field of every record, deduplicate and sort into a key set.
3. **Consistency comparison**: using the first system's key set as the baseline, compare whether the other systems' key sets match.
4. **Difference output**: inconsistent systems go into inconsistent, with the differing fields (symmetric difference, at most 20).
5. **Gate decision**: all key sets identical → passed (exit=0); otherwise → failed (exit=2).

### Input JSON format
```json
{
  "transferSystem": [
    {"key": "txnId", "value": "T001"},
    {"key": "amount", "value": "100"},
    {"key": "status", "value": "SUCCESS"}
  ],
  "accountSystem": [
    {"key": "txnId", "value": "T001"},
    {"key": "amount", "value": "100"}
  ]
}
```

### JSON output example
```json
{
  "systems": 2,
  "inconsistent": [
    {"system_index": 1, "diff": ["status"]}
  ],
  "consistent": false
}
```

### Usage examples
```bash
# Basic data flow check
python skills/qa-integration-test/scripts/data_flow_verify.py system-data.json

# JSON output (for the Agent)
python skills/qa-integration-test/scripts/data_flow_verify.py system-data.json --json

# CI gate (driven by exit code; passes only when data is consistent)
python skills/qa-integration-test/scripts/data_flow_verify.py system-data.json && echo "Data flow consistent" || echo "Data flow inconsistent"
```

### Limits
- Only checks key set consistency, not value consistency (use a data comparison tool).
- The first system is the baseline and the others are compared with it (the choice of baseline system affects the result).
- At most 20 differing fields are output (to keep the output small).
- Does not check data freshness or order (only key existence).

### Unit tests
The `qa-integration-test/data_flow_verify.py` entry in `tests/test_scripts.py` (3 cases):
- `data_consistent`: all systems have the same key set → exit=0, consistent=true
- `data_inconsistent`: key sets differ between systems → exit=2, inconsistent is not empty
- `missing_file`: file does not exist → exit=3, output contains `error`
