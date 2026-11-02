'use strict';

function updatePasswordByUsername(query, userName, passwordHash) {
  return query(
    `update app_users
     set password = $1,
         auth_session_version = coalesce(auth_session_version, 0) + 1,
         updated_at = now()
     where user_name = $2
     returning auth_session_version`,
    [passwordHash, userName]
  );
}

function updatePasswordById(query, userId, passwordHash) {
  return query(
    `update app_users
     set password = $2,
         auth_session_version = coalesce(auth_session_version, 0) + 1,
         updated_at = now()
     where id = $1
     returning id, user_name, email, role, created_at`,
    [userId, passwordHash]
  );
}

module.exports = { updatePasswordByUsername, updatePasswordById };
