
ALTER TABLE public.scripts
  ADD COLUMN music_path text,
  ADD COLUMN music_filename text,
  ADD COLUMN music_autoplay boolean NOT NULL DEFAULT false,
  ADD COLUMN music_volume numeric NOT NULL DEFAULT 0.6,
  ADD COLUMN music_loop boolean NOT NULL DEFAULT true,
  ADD COLUMN music_start_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN music_ducking boolean NOT NULL DEFAULT true,
  ADD COLUMN music_fade_in integer NOT NULL DEFAULT 2,
  ADD COLUMN music_fade_out integer NOT NULL DEFAULT 2;

INSERT INTO storage.buckets (id, name, public)
VALUES ('script-music', 'script-music', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Script music: select own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'script-music' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Script music: insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'script-music' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Script music: update own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'script-music' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Script music: delete own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'script-music' AND auth.uid()::text = (storage.foldername(name))[1]);
