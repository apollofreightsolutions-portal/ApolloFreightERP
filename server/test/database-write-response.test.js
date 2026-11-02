'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { respondDatabaseWriteUnavailable } = require('../src/database-write-response');

test('database write failure response is an explicit non-success and asks for verification before retry', () => {
  const response = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  const returnedResponse = respondDatabaseWriteUnavailable(response);
  assert.equal(returnedResponse, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.ok, false);
  assert.match(response.payload.error, /could not confirm/i);
  assert.match(response.payload.error, /check the record before retrying/i);
  assert.equal(Object.hasOwn(response.payload, 'mode'), false);
});
