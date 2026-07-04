"""
Offline verification harness for bank.json.

For each problem, runs its referencePython against every test case in
`examples` and `hiddenTests` by feeding `input` (or `input`/`expected`)
on stdin and asserting that trimmed stdout matches the trimmed expected
output.  Prints a per-problem PASS/FAIL summary and exits non-zero if
ANY test fails.

Usage:
    python3 verify_bank.py
    python3 verify_bank.py --slug two-sum-indices   # run one problem only
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import Any


BANK_PATH = Path(__file__).parent / "bank.json"
PYTHON_BIN = sys.executable  # same interpreter that's running this script


def run_solution(source: str, stdin_text: str, timeout: float = 10.0) -> tuple[str, str]:
    """Write source to a temp file, run it with stdin_text, return (stdout, stderr)."""
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(source)
        tmp_path = f.name

    result = subprocess.run(
        [PYTHON_BIN, tmp_path],
        input=stdin_text,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    Path(tmp_path).unlink(missing_ok=True)
    return result.stdout, result.stderr


def check_problem(problem: dict[str, Any]) -> tuple[int, int, list[str]]:
    """
    Run all test cases for a single problem.
    Returns (passed, total, failure_messages).
    """
    slug: str = problem["slug"]
    source: str = textwrap.dedent(problem["referencePython"])

    # Normalise test cases: examples use "output", hidden tests use "expected".
    cases: list[dict[str, str]] = []
    for ex in problem.get("examples", []):
        cases.append({"input": ex["input"], "expected": ex["output"], "kind": "example"})
    for ht in problem.get("hiddenTests", []):
        cases.append({"input": ht["input"], "expected": ht["expected"], "kind": "hidden"})

    passed = 0
    failures: list[str] = []

    for idx, case in enumerate(cases):
        stdin_text: str = case["input"]
        expected: str = case["expected"].strip()
        kind: str = case["kind"]
        label = f"{slug} [{kind} #{idx}]"

        try:
            stdout, stderr = run_solution(source, stdin_text, timeout=10.0)
        except subprocess.TimeoutExpired:
            failures.append(f"  {label}: TIMEOUT (>10s)")
            continue
        except Exception as exc:
            failures.append(f"  {label}: EXCEPTION — {exc}")
            continue

        actual = stdout.strip()
        if actual == expected:
            passed += 1
        else:
            failures.append(
                f"  {label}: WRONG ANSWER\n"
                f"    input:    {repr(stdin_text[:120])}\n"
                f"    expected: {repr(expected[:200])}\n"
                f"    got:      {repr(actual[:200])}"
                + (f"\n    stderr:   {stderr.strip()[:200]}" if stderr.strip() else "")
            )

    return passed, len(cases), failures


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify problem bank reference solutions.")
    parser.add_argument("--slug", help="Run only the problem with this slug.")
    args = parser.parse_args()

    with BANK_PATH.open() as f:
        bank: list[dict[str, Any]] = json.load(f)

    if args.slug:
        bank = [p for p in bank if p["slug"] == args.slug]
        if not bank:
            print(f"ERROR: no problem with slug '{args.slug}' found in bank.json")
            sys.exit(1)

    total_problems = len(bank)
    total_passed = 0
    total_cases = 0
    total_cases_passed = 0
    all_failures: list[str] = []

    header_width = 60
    print("=" * header_width)
    print(f"{'OVERFORGE PROBLEM BANK — VERIFICATION':^{header_width}}")
    print(f"{'bank.json: ' + str(BANK_PATH):^{header_width}}")
    print("=" * header_width)

    for problem in bank:
        slug = problem["slug"]
        title = problem["title"]
        difficulty = problem["difficulty"]
        levels = ", ".join(problem.get("levels", []))

        passed, total, failures = check_problem(problem)
        total_cases += total
        total_cases_passed += passed

        status = "PASS" if not failures else "FAIL"
        if not failures:
            total_passed += 1

        marker = "+" if not failures else "X"
        print(
            f"  [{marker}] {slug:<32} {difficulty:<8} [{levels}]"
            f"  {passed}/{total} tests"
        )
        for msg in failures:
            print(msg)
            all_failures.append(msg)

    print("-" * header_width)
    print(
        f"  Problems : {total_passed}/{total_problems} passed"
        f"   Cases : {total_cases_passed}/{total_cases} passed"
    )
    print("=" * header_width)

    if all_failures:
        print(f"\nFAILED — {len(all_failures)} test case(s) did not pass.\n")
        sys.exit(1)
    else:
        print("\nALL PROBLEMS FULLY PASSING.\n")


if __name__ == "__main__":
    main()
