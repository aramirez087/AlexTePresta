-- user_simulation_overrides: per-user simulated rate overrides (admin-managed)
CREATE TABLE public.user_simulation_overrides (
  user_id               uuid    PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  simulated_annual_rate text    NOT NULL,
  updated_by            uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_simulation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_simulation_overrides"
  ON public.user_simulation_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "users_read_own_simulation_override"
  ON public.user_simulation_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid());
