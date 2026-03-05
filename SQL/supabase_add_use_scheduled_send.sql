-- Adds toggle support for scheduled send behavior in Settings/Notifications.
-- Safe to run multiple times.
ALTER TABLE public.notification_preferences
ADD COLUMN IF NOT EXISTS use_scheduled_send boolean NOT NULL DEFAULT true;
