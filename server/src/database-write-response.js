'use strict';

function respondDatabaseWriteUnavailable(response) {
  return response.status(503).json({
    ok: false,
    error: 'The database is unavailable or missing required setup. The server could not confirm this change; check the record before retrying.'
  });
}

module.exports = { respondDatabaseWriteUnavailable };
