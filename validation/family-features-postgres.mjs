import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const database = new PGlite();
const ids = {
  home: "10000000-0000-4000-8000-000000000001",
  otherHome: "10000000-0000-4000-8000-000000000002",
  owner: "20000000-0000-4000-8000-000000000001",
  recipient: "20000000-0000-4000-8000-000000000002",
  admin: "20000000-0000-4000-8000-000000000003",
  outsider: "20000000-0000-4000-8000-000000000004",
  ownerMember: "30000000-0000-4000-8000-000000000001",
  recipientMember: "30000000-0000-4000-8000-000000000002",
  adminMember: "30000000-0000-4000-8000-000000000003",
  outsiderMember: "30000000-0000-4000-8000-000000000004",
  child: "30000000-0000-4000-8000-000000000005",
  task: "40000000-0000-4000-8000-000000000001",
};

async function asUser(user, action) {
  await database.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${user}', false)`,
  );
  try {
    return await action();
  } finally {
    await database.exec("RESET ROLE");
  }
}

await test("v0.91: migración y permisos en PostgreSQL aislado", async (suite) => {
  await database.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
    CREATE TABLE public.households(id uuid PRIMARY KEY);
    CREATE TABLE public.household_members(id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES public.households(id), user_id uuid REFERENCES auth.users(id), display_name text NOT NULL, is_child boolean NOT NULL DEFAULT false, UNIQUE(household_id, user_id));
    CREATE TABLE public.user_roles(user_id uuid, household_id uuid, role text);
    CREATE TABLE public.tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid REFERENCES public.households(id), created_by uuid NOT NULL REFERENCES auth.users(id), title text NOT NULL, description text, assigned_to uuid REFERENCES public.household_members(id) ON DELETE SET NULL, status text NOT NULL DEFAULT 'pending', priority text NOT NULL DEFAULT 'medium', category text, due_date timestamptz, recurrence_days integer, child_allowed boolean NOT NULL DEFAULT false, checklist jsonb, photo_path text);
    ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY task_household ON public.tasks FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = tasks.household_id AND user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = tasks.household_id AND user_id = auth.uid()));
    GRANT SELECT ON public.household_members, public.user_roles TO authenticated;
    GRANT ALL ON public.tasks TO authenticated;
    INSERT INTO public.households VALUES ('${ids.home}'), ('${ids.otherHome}');
    INSERT INTO auth.users VALUES ('${ids.owner}'), ('${ids.recipient}'), ('${ids.admin}'), ('${ids.outsider}');
    INSERT INTO public.household_members VALUES
      ('${ids.ownerMember}', '${ids.home}', '${ids.owner}', 'Titular', false),
      ('${ids.recipientMember}', '${ids.home}', '${ids.recipient}', 'Receptor', false),
      ('${ids.adminMember}', '${ids.home}', '${ids.admin}', 'Admin sin concesión', false),
      ('${ids.outsiderMember}', '${ids.otherHome}', '${ids.outsider}', 'Otra familia', false),
      ('${ids.child}', '${ids.home}', NULL, 'Perfil infantil', true);
    INSERT INTO public.user_roles VALUES ('${ids.owner}', '${ids.home}', 'admin'), ('${ids.admin}', '${ids.home}', 'admin'), ('${ids.outsider}', '${ids.otherHome}', 'admin');
  `);
  await database.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261019110000_personal_health_preferences_multitasks.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  await suite.test("preferencias privadas, seleccionado, revocación y conflictos", async () => {
    await asUser(ids.owner, () =>
      database.query("SELECT public.save_member_preference($1,'food','Arroz','private','{}',0)", [
        ids.home,
      ]),
    );
    assert.equal(
      (await asUser(ids.admin, () => database.query("SELECT * FROM public.member_preferences")))
        .rows.length,
      0,
    );
    await asUser(ids.owner, () =>
      database.query("SELECT public.save_member_preference($1,'food','Arroz','selected',$2,1)", [
        ids.home,
        [ids.recipient],
      ]),
    );
    assert.equal(
      (
        await asUser(ids.recipient, () =>
          database.query("SELECT details FROM public.member_preferences"),
        )
      ).rows[0].details,
      "Arroz",
    );
    assert.equal(
      (await asUser(ids.outsider, () => database.query("SELECT * FROM public.member_preferences")))
        .rows.length,
      0,
    );
    await assert.rejects(
      () =>
        asUser(ids.owner, () =>
          database.query(
            "SELECT public.save_member_preference($1,'food','Antiguo','private','{}',1)",
            [ids.home],
          ),
        ),
      /Conflicto/,
    );
    await asUser(ids.owner, () =>
      database.query("SELECT public.save_member_preference($1,'food','Arroz','private','{}',2)", [
        ids.home,
      ]),
    );
    assert.equal(
      (await asUser(ids.recipient, () => database.query("SELECT * FROM public.member_preferences")))
        .rows.length,
      0,
    );
    await assert.rejects(
      () =>
        asUser(ids.outsider, () =>
          database.query(
            "SELECT public.save_member_preference($1,'food','Cambio','private','{}',0)",
            [ids.home],
          ),
        ),
      /autorizado/,
    );
  });

  await suite.test("resumen de ciclo sin privilegio automático de admin", async () => {
    await asUser(ids.owner, () =>
      database.query(
        "INSERT INTO public.cycle_shared_summaries VALUES ($1,$2,'2026-10-01','2026-10-05','2026-10-29',$3)",
        [ids.home, ids.owner, [ids.recipient]],
      ),
    );
    assert.equal(
      (
        await asUser(ids.recipient, () =>
          database.query("SELECT * FROM public.cycle_shared_summaries"),
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (await asUser(ids.admin, () => database.query("SELECT * FROM public.cycle_shared_summaries")))
        .rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(ids.outsider, () =>
          database.query("SELECT * FROM public.cycle_shared_summaries"),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        asUser(ids.owner, () =>
          database.query("UPDATE public.cycle_shared_summaries SET recipients = $1", [
            [ids.outsider],
          ]),
        ),
      /Destinatario/,
    );
    const changed = await asUser(ids.recipient, () =>
      database.query("DELETE FROM public.cycle_shared_summaries RETURNING *"),
    );
    assert.equal(changed.rows.length, 0);
  });

  await suite.test("recordatorios exclusivamente propios y sin acceso anónimo", async () => {
    await asUser(ids.owner, () =>
      database.query(
        "INSERT INTO public.personal_cycle_reminders(household_id,owner_user_id,due_at,expected_date) VALUES ($1,$2,now(),'2026-10-29')",
        [ids.home, ids.owner],
      ),
    );
    assert.equal(
      (
        await asUser(ids.admin, () =>
          database.query("SELECT * FROM public.personal_cycle_reminders"),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        asUser(ids.outsider, () =>
          database.query(
            "INSERT INTO public.personal_cycle_reminders(household_id,owner_user_id,due_at,expected_date) VALUES ($1,$2,now(),'2026-10-29')",
            [ids.home, ids.outsider],
          ),
        ),
      /row-level security/,
    );
    await database.exec("SET ROLE anon");
    await assert.rejects(
      () => database.query("SELECT * FROM public.cycle_shared_summaries"),
      /permission denied/,
    );
    await database.exec("RESET ROLE");
  });

  await suite.test(
    "el mismo aviso no se rearma al guardar observaciones ni se reserva dos veces",
    async () => {
      const due = new Date(Date.now() + 86_400_000).toISOString();
      await asUser(ids.owner, () =>
        database.query("SELECT public.save_personal_cycle_reminder($1,$2,'2026-10-29')", [
          ids.home,
          due,
        ]),
      );
      const first = await database.query(
        "UPDATE public.personal_cycle_reminders SET notified_at=now(), attempts=1, last_attempt_at=now() WHERE owner_user_id=$1 AND attempts=0 AND notified_at IS NULL RETURNING *",
        [ids.owner],
      );
      assert.equal(first.rows.length, 1);
      const second = await database.query(
        "UPDATE public.personal_cycle_reminders SET notified_at=now(), attempts=1 WHERE owner_user_id=$1 AND attempts=0 AND notified_at IS NULL RETURNING *",
        [ids.owner],
      );
      assert.equal(second.rows.length, 0);
      await asUser(ids.owner, () =>
        database.query("SELECT public.save_personal_cycle_reminder($1,$2,'2026-10-29')", [
          ids.home,
          due,
        ]),
      );
      const row = (
        await database.query(
          "SELECT * FROM public.personal_cycle_reminders WHERE owner_user_id=$1",
          [ids.owner],
        )
      ).rows[0];
      assert.equal(row.attempts, 1);
      assert.notEqual(row.notified_at, null);
    },
  );

  await suite.test("tarea para todos: permisos, repetición y checklist reiniciada", async () => {
    await asUser(ids.owner, () =>
      database.query(
        "INSERT INTO public.tasks(id,household_id,created_by,title,assigned_member_ids,completion_mode,recurrence_days,checklist) VALUES ($1,$2,$3,'Compartida',$4,'all',7,'[{\"text\":\"Limpiar\",\"done\":true}]')",
        [ids.task, ids.home, ids.owner, [ids.ownerMember, ids.recipientMember]],
      ),
    );
    await assert.rejects(
      () =>
        asUser(ids.owner, () =>
          database.query("UPDATE public.tasks SET status = 'done' WHERE id = $1", [ids.task]),
        ),
      /Faltan/,
    );
    await assert.rejects(
      () =>
        asUser(ids.outsider, () =>
          database.query("SELECT public.complete_household_task($1)", [ids.task]),
        ),
      /autorizado/,
    );
    await assert.rejects(
      () =>
        asUser(ids.owner, () =>
          database.query("SELECT public.complete_household_task($1,$2)", [
            ids.task,
            ids.recipientMember,
          ]),
        ),
      /Solo puede/,
    );
    await asUser(ids.owner, () =>
      database.query("SELECT public.complete_household_task($1)", [ids.task]),
    );
    assert.equal(
      (await database.query("SELECT status FROM public.tasks WHERE id = $1", [ids.task])).rows[0]
        .status,
      "in_progress",
    );
    await asUser(ids.owner, () =>
      database.query("SELECT public.complete_household_task($1)", [ids.task]),
    );
    await asUser(ids.recipient, () =>
      database.query("SELECT public.complete_household_task($1)", [ids.task]),
    );
    await asUser(ids.recipient, () =>
      database.query("SELECT public.complete_household_task($1)", [ids.task]),
    );
    assert.equal(
      (await database.query("SELECT status FROM public.tasks WHERE id = $1", [ids.task])).rows[0]
        .status,
      "done",
    );
    const next = (
      await database.query("SELECT * FROM public.tasks WHERE recurrence_parent_id = $1", [ids.task])
    ).rows;
    assert.equal(next.length, 1);
    assert.deepEqual(next[0].completed_member_ids, []);
    assert.equal(next[0].checklist[0].done, false);
    assert.equal(next[0].assigned_member_ids.length, 2);
  });

  await suite.test("tarea para cualquiera y representación infantil limitada a admin", async () => {
    const created = await asUser(ids.owner, () =>
      database.query(
        "INSERT INTO public.tasks(household_id,created_by,title,assigned_member_ids,child_allowed) VALUES ($1,$2,'Con menor',$3,true) RETURNING id",
        [ids.home, ids.owner, [ids.child, ids.recipientMember]],
      ),
    );
    const task = created.rows[0].id;
    await assert.rejects(
      () =>
        asUser(ids.recipient, () =>
          database.query("SELECT public.complete_household_task($1,$2)", [task, ids.child]),
        ),
      /Solo puede/,
    );
    await asUser(ids.owner, () =>
      database.query("SELECT public.complete_household_task($1,$2)", [task, ids.child]),
    );
    assert.equal(
      (await database.query("SELECT status FROM public.tasks WHERE id = $1", [task])).rows[0]
        .status,
      "done",
    );
    await assert.rejects(
      () =>
        asUser(ids.owner, () =>
          database.query(
            "INSERT INTO public.tasks(household_id,created_by,title,assigned_member_ids) VALUES ($1,$2,'Fuera',$3)",
            [ids.home, ids.owner, [ids.outsiderMember]],
          ),
        ),
      /Responsable no autorizado/,
    );
    await assert.rejects(
      () =>
        asUser(ids.owner, () =>
          database.query(
            "INSERT INTO public.tasks(household_id,created_by,title,assigned_member_ids) VALUES ($1,$2,'Menor no apto',$3)",
            [ids.home, ids.owner, [ids.child]],
          ),
        ),
      /Responsable no autorizado/,
    );
  });

  await suite.test(
    "salir del hogar elimina concesiones antiguas y no las recupera al volver",
    async () => {
      await database.query("DELETE FROM public.household_members WHERE id = $1", [
        ids.recipientMember,
      ]);
      assert.equal(
        (await database.query("SELECT * FROM public.cycle_shared_summaries")).rows.length,
        0,
      );
      await database.query(
        "INSERT INTO public.household_members(id,household_id,user_id,display_name) VALUES ($1,$2,$3,'Receptor vuelve')",
        [ids.recipientMember, ids.home, ids.recipient],
      );
      assert.equal(
        (
          await asUser(ids.recipient, () =>
            database.query("SELECT * FROM public.cycle_shared_summaries"),
          )
        ).rows.length,
        0,
      );
    },
  );
  await database.close();
});
