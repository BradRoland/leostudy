# PUBLIC GLOBAL CHAT WIDGET SPECIFICATION

## Overview
Update the PUBLIC GLOBAL CHAT feature so it is AVAILABLE ON EVERY PAGE as a floating, minimizable chat widget. Users can minimize it into the corner of the screen and click a small icon/button to expand it again. Use Supabase (Auth + DB + Realtime). Keep it simple, clean, and professional.

## GOALS
- A global "Public Chat" widget that is accessible on all routes/pages.
- Collapsible/minimizable UI: expanded chat panel ↔ minimized icon in a screen corner.
- Realtime messages for everyone.

## 1) GLOBAL WIDGET BEHAVIOR
- Render the chat widget in the global app layout (root layout) so it appears on every page.
- Default state:
  - Minimized by default for new users (preferred) OR remember last state.
  - The widget has two states:
    - A) Minimized:
      - A small circular button/icon in bottom-right (or bottom-left) corner.
      - Shows unread badge count (e.g., "3") when new messages arrive while minimized.
      - Clicking expands the chat.
    - B) Expanded:
      - A small panel/card anchored to the same corner.
      - Has header with:
        - "Public Chat"
        - minimize button
        - optional close button (close = minimize)
      - Body: scrollable message list
      - Footer: input + send button

## 2) UI/UX REQUIREMENTS (PROFESSIONAL)
- Clean modern styling consistent with the app:
  - Rounded corners, subtle shadow, neutral tones
- Panel size:
  - Desktop: ~320–420px width, ~420–600px height
  - Mobile: responsive (full width bottom sheet or near-full width panel)
- Smooth open/close animation:
  - expand/collapse transition (scale/fade/slide)
- Do NOT block important UI:
  - Ensure the widget doesn't cover critical buttons; allow user to drag position optional (nice-to-have)
- Provide a small "New messages" toast or badge when minimized.

## 3) MESSAGE LIST BEHAVIOR
- Load last 50–100 messages initially, ordered ascending (oldest at top, newest at bottom).
- Auto-scroll rules:
  - If user is near bottom, keep pinned to bottom when new messages arrive.
  - If user scrolled up, do not snap; show "New messages" indicator that scrolls to bottom.
- Show each message:
  - display name
  - optional agency badge (small)
  - timestamp
  - message text (plain text, no HTML)

## 4) SENDING MESSAGES
- Only authenticated users can send:
  - If not authed, show disabled input + "Sign in to chat" action.
- Validate:
  - trim
  - min 1 char
  - max 280 (or 500)
- Enter sends; Shift+Enter newline (optional)
- Client-side rate limit: at least 1 message per 2 seconds.

## 5) UNREAD COUNT / NOTIFICATIONS
- Track unread count while:
  - widget is minimized OR
  - widget expanded but user not focused and scrolled away from bottom (optional)
- Reset unread count when:
  - user expands widget AND
  - user scrolls to bottom (or clicks "New messages")
- Persist widget UI state (minimized/expanded) in localStorage so it stays consistent across refresh/navigation.

## 6) SUPABASE: DB + REALTIME
Use the same Supabase public chat backend:
- Table: public_messages
  - id (uuid pk)
  - user_id (uuid fk)
  - display_name (text)
  - agency (text nullable)
  - message (text)
  - created_at (timestamptz default now())
  - is_deleted (bool default false)
- Table: public_message_reports (already exists or create)
  - id (uuid pk)
  - message_id (uuid fk)
  - reporter_user_id (uuid fk)
  - reason (text)
  - created_at (timestamptz default now())

Realtime:
- Subscribe to inserts on public_messages.
- Append new messages live.

## 7) MODERATION + SAFETY (KEEP SIMPLE BUT PRESENT)
- Add per-message overflow menu (⋯):
  - "Report" for regular users (writes to public_message_reports)
  - "Delete" only for admins/owner (soft delete)
- RLS:
  - Anyone can SELECT (or authed only if you prefer)
  - Only authed can INSERT with user_id = auth.uid()
  - Only admins/owner can soft delete

## 8) IMPLEMENTATION NOTES
- Build as a reusable component: GlobalChatWidget
- Mount it once in the root layout so it persists across route changes.
- Avoid duplicate realtime subscriptions (only one active subscription).
- Memoize message list rendering and keep it performant.
- Sanitize output: render message as plain text, escape HTML.
- Use consistent animation approach used elsewhere in the app (Framer Motion if already used).

## 9) ACCEPTANCE CRITERIA
- Chat icon appears on every page in the chosen corner.
- Clicking icon expands chat panel; clicking minimize collapses back to icon.
- Messages update in realtime.
- Unread badge increments while minimized and resets when opened/seen.
- Auth gating works: signed out users cannot send.
- UI looks clean and professional on desktop + mobile.
