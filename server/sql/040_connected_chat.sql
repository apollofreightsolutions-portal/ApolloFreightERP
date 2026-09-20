create table if not exists connected_chat_messages (
    id bigserial primary key,
    sender_user text not null,
    recipient_user text not null,
    body text not null,
    context_json text not null default '{}',
    read_at timestamptz,
    created_at timestamptz not null default now(),
    constraint connected_chat_sender_recipient_different check (lower(sender_user) <> lower(recipient_user)),
    constraint connected_chat_body_length check (char_length(body) between 1 and 2000)
);

create index if not exists connected_chat_sender_created_idx
    on connected_chat_messages (lower(sender_user), created_at desc);
create index if not exists connected_chat_recipient_created_idx
    on connected_chat_messages (lower(recipient_user), created_at desc);
create index if not exists connected_chat_unread_idx
    on connected_chat_messages (lower(recipient_user), created_at desc)
    where read_at is null;
