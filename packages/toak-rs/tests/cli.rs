//! Integration tests for the CLI commands

use assert_cmd::cargo::cargo_bin_cmd;
use predicates::prelude::*;

#[test]
fn test_version_command() {
    let mut cmd = cargo_bin_cmd!("toak");
    cmd.arg("version");

    cmd.assert()
        .success()
        .stdout(predicate::str::starts_with("toak "));
}

#[test]
fn test_version_flag() {
    let mut cmd = cargo_bin_cmd!("toak");
    cmd.arg("--version");

    cmd.assert()
        .success()
        .stdout(predicate::str::starts_with("toak "));
}

#[test]
fn test_version_short_flag() {
    let mut cmd = cargo_bin_cmd!("toak");
    cmd.arg("-V");

    cmd.assert()
        .success()
        .stdout(predicate::str::starts_with("toak "));
}
