#!/usr/bin/env python3
"""Regression test for the workflows fixed in the 2026-11-04 CI audit.

Before this fix, ci.yml, editor-contract-drift.yml and pr-test-analysis.yml
all triggered on push to 'master', while this repo's branch is 'main' (and
everything is pushed straight to main, with no PRs) -- so none of the three
had ever run. ci.yml also set top-level permissions to contents: write for
every job, including pull_request jobs that don't need it.

Run with: python3 .github/scripts/test_ci_triggers.py
"""
import pathlib
import sys

import yaml

WORKFLOWS = pathlib.Path(__file__).resolve().parent.parent / "workflows"


def load(name):
    with open(WORKFLOWS / name) as f:
        return yaml.safe_load(f)


def check_ci_triggers_on_main():
    doc = load("ci.yml")
    # PyYAML parses the unquoted key `on:` as the boolean True (YAML 1.1).
    push = doc[True]["push"]
    assert "main" in push["branches"], "ci.yml push.branches must include 'main'"
    assert "master" not in push["branches"], "ci.yml push.branches must not target 'master'"


def check_ci_top_level_permissions():
    doc = load("ci.yml")
    perms = doc.get("permissions") or {}
    assert perms.get("contents") == "read", "ci.yml top-level permissions must be contents: read"


def check_ci_deploy_job():
    doc = load("ci.yml")
    deploy = doc["jobs"]["deploy"]
    assert deploy["if"] == "github.ref == 'refs/heads/main'", (
        "deploy's branch guard must match the push trigger (main), or it "
        "will never run"
    )
    assert deploy.get("permissions", {}).get("contents") == "write", (
        "deploy pushes a tag and creates a release, so it needs its own "
        "contents: write now that the top-level permissions are read-only"
    )


def check_build_fips_guarded():
    doc = load("ci.yml")
    build_steps = doc["jobs"]["build"]["steps"]
    fips_steps = [s for s in build_steps if "build-fips" in s.get("uses", "")]
    assert len(fips_steps) == 1, "expected exactly one build-fips step"
    assert fips_steps[0].get("if") == "github.repository_owner == 'mattermost'", (
        "the FIPS build pulls from Mattermost's own Chainguard registry "
        "and needs Mattermost's CHAINGUARD_IDENTITY; it must stay "
        "owner-guarded so it doesn't run (and fail) in this fork"
    )


def check_editor_contract_drift_triggers_on_main():
    doc = load("editor-contract-drift.yml")
    push = doc[True]["push"]
    assert "main" in push["branches"]
    assert "master" not in push["branches"]


def check_pr_test_analysis_triggers_on_main():
    doc = load("pr-test-analysis.yml")
    pr = doc[True]["pull_request"]
    assert "main" in pr["branches"]
    assert "master" not in pr["branches"]


def check_editor_contract_drift_checks_out_antimatter():
    # Found in the 2026-11-05 CI audit: this step checked out
    # mattermost/mattermost@master into path 'antimatter', while every later
    # step cd's into 'mattermost/webapp' -- the wrong repo (upstream, not our
    # fork) at a path nothing read.
    doc = load("editor-contract-drift.yml")
    steps = doc["jobs"]["live-host-probe"]["steps"]
    host_checkout = next(s for s in steps if s.get("with", {}).get("repository"))
    checkout_path = host_checkout["with"]["path"]
    assert host_checkout["with"]["repository"] == "AntimatterChat/antimatter", (
        "the live-host checkout must be our fork, not upstream "
        "mattermost/mattermost -- the drift check is against antimatter's "
        "own editor contract"
    )
    assert host_checkout["with"]["ref"] == "main", (
        "AntimatterChat/antimatter's default branch is 'main', not 'master'"
    )
    host_webapp_runs = [
        s["run"] for s in steps
        if "run" in s and "AM_WEBAPP_PATH" not in s.get("env", {})
        and f"{checkout_path}/webapp" in s["run"]
    ]
    assert host_webapp_runs, (
        f"expected a later step to cd into '{checkout_path}/webapp' (the "
        "checkout's own webapp dir), matching the checkout path"
    )
    probe_step = next(s for s in steps if "AM_WEBAPP_PATH" in s.get("env", {}))
    assert probe_step["env"]["AM_WEBAPP_PATH"].endswith(f"{checkout_path}/webapp"), (
        "AM_WEBAPP_PATH must point at the checked-out host webapp, matching "
        "the checkout path"
    )


CHECKS = [
    check_ci_triggers_on_main,
    check_ci_top_level_permissions,
    check_ci_deploy_job,
    check_build_fips_guarded,
    check_editor_contract_drift_triggers_on_main,
    check_pr_test_analysis_triggers_on_main,
    check_editor_contract_drift_checks_out_antimatter,
]


def main():
    failures = []
    for check in CHECKS:
        try:
            check()
        except AssertionError as e:
            failures.append(f"{check.__name__}: {e}")
    if failures:
        print("FAIL")
        for f in failures:
            print(f" - {f}")
        return 1
    print(f"OK: {len(CHECKS)} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
