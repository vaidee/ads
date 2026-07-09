'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { csvEscape, toCsv } = require('../functions/api/csv');

test('csvEscape passes through plain values', () => {
  assert.equal(csvEscape('hello'), 'hello');
  assert.equal(csvEscape(42), '42');
});

test('csvEscape returns empty string for null/undefined', () => {
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('csvEscape quotes and doubles internal quotes when needed', () => {
  assert.equal(csvEscape('has,comma'), '"has,comma"');
  assert.equal(csvEscape('has\nnewline'), '"has\nnewline"');
  assert.equal(csvEscape('has "quotes"'), '"has ""quotes"""');
});

test('toCsv builds a header row plus one row per record', () => {
  const columns = [
    { key: 'filename', label: 'filename' },
    { key: 'status', label: 'status' },
  ];
  const rows = [
    { filename: 'a.mp4', status: 'APPROVED' },
    { filename: 'b, weird.mp4', status: 'NEEDS_REVIEW' },
  ];

  const csv = toCsv(columns, rows);
  assert.equal(csv, 'filename,status\na.mp4,APPROVED\n"b, weird.mp4",NEEDS_REVIEW');
});
