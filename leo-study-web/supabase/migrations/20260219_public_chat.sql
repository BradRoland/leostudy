-- Public Chat tables for global chat widget
-- Run this in Supabase SQL editor

-- Public messages table
CREATE TABLE IF NOT EXISTS public.public_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  agency text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id)
);

-- Reports table
CREATE TABLE IF NOT EXISTS public.public_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.public_messages(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for faster message fetching
CREATE INDEX IF NOT EXISTS idx_public_messages_created_at ON public.public_messages (created_at DESC);

-- Enable RLS
ALTER TABLE public.public_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_message_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies for public_messages
DROP POLICY IF EXISTS "public_messages_select_all" ON public.public_messages;
CREATE POLICY "public_messages_select_all" ON public.public_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_messages_insert_authenticated" ON public.public_messages;
CREATE POLICY "public_messages_insert_authenticated" ON public.public_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "public_messages_delete_admin_only" ON public.public_messages;
CREATE POLICY "public_messages_delete_admin_only" ON public.public_messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  OR user_id = auth.uid()
);

-- RLS policies for public_message_reports
DROP POLICY IF EXISTS "public_message_reports_insert_authenticated" ON public.public_message_reports;
CREATE POLICY "public_message_reports_insert_authenticated" ON public.public_message_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS "public_message_reports_select_admin_only" ON public.public_message_reports;
CREATE POLICY "public_message_reports_select_admin_only" ON public.public_message_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner')
);

-- Grant execute to authenticated users
GRANT SELECT ON public.public_messages TO authenticated, anon;
GRANT INSERT ON public.public_messages TO authenticated;
GRANT UPDATE ON public.public_messages TO authenticated;
GRANT SELECT, INSERT ON public.public_message_reports TO authenticated;

-- Enable realtime for public_messages (add to existing publication)
ALTER PUBLICATION supabase_realtime ADD TABLE public.public_messages;
