import assert from "node:assert/strict";
import test from "node:test";
import { migrationChecksums } from "./migrate.js";

test("migration checksums ignore CRLF and LF differences", () => {
  const lf = "CREATE TABLE example (id integer);\n";
  const crlf = lf.replace(/\n/g, "\r\n");

  assert.equal(
    migrationChecksums(lf).checksum,
    migrationChecksums(crlf).checksum,
  );
});

test("raw checksum remains available for legacy migrations", () => {
  const lf = "SELECT 1;\n";
  const crlf = lf.replace(/\n/g, "\r\n");

  assert.equal(
    migrationChecksums(crlf).rawChecksum,
    migrationChecksums(crlf.replace(/\r\n/g, "\r\n")).rawChecksum,
  );
  assert.notEqual(
    migrationChecksums(lf).rawChecksum,
    migrationChecksums(crlf).rawChecksum,
  );
});
