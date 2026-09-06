"""Run on the isolated test host with Docker access; never accepts another database.

Eight independent PostgreSQL connections race for one synthetic user's first
reward. Fixtures are committed so sessions can share them, then deleted in a
finally block. No copied account, production database or system clock changes.
"""

import concurrent.futures
import json
import subprocess
import threading
import uuid


DATABASE = "codex_class180_ui_test_20260906"
CONNECTIONS = 8


def sql(statement):
    guard = "do $$ begin if current_database() <> '" + DATABASE + "' then raise exception 'Isolated clone required'; end if; end $$;\n"
    result = subprocess.run(
        ["docker", "exec", "-i", "supabase-db", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", DATABASE],
        input=guard + statement, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def main():
    user_id, peer_id, academy_id, class_id = [str(uuid.uuid4()) for _ in range(4)]
    barrier = threading.Barrier(CONNECTIONS)
    cleanup = f"""
begin;
delete from auth.users where id in ('{user_id}', '{peer_id}');
delete from public.academy_classes where id='{class_id}';
delete from public.academies where id='{academy_id}';
commit;
select count(*) from daily_reward_private.progress where user_id in ('{user_id}', '{peer_id}');
select count(*) from daily_reward_private.claims where user_id in ('{user_id}', '{peer_id}');
"""
    try:
        sql(f"""
begin;
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role) values
('{user_id}','reward-race-{user_id}@example.invalid','{{}}','{{}}','authenticated','authenticated'),
('{peer_id}','reward-peer-{peer_id}@example.invalid','{{}}','{{}}','authenticated','authenticated');
insert into public.academies(id,name,city,state) values ('{academy_id}','Synthetic reward concurrency academy','Synthetic','CA');
insert into public.academy_classes(id,academy_id,class_name,status,visibility,join_mode)
values ('{class_id}','{academy_id}','Synthetic reward concurrency class','active','unlisted','open');
insert into public.class_memberships(class_id,user_id,role,status,is_active) values
('{class_id}','{user_id}','cadet','active',true), ('{class_id}','{peer_id}','cadet','active',true);
commit;
""")

        def claim(_):
            barrier.wait(timeout=20)
            output = sql(f"""
begin;
set local role authenticated;
set local request.jwt.claims = '{{"sub":"{user_id}","role":"authenticated"}}';
select public.claim_daily_reward();
commit;
""")
            return json.loads(output.splitlines()[-1])

        with concurrent.futures.ThreadPoolExecutor(max_workers=CONNECTIONS) as pool:
            results = list(pool.map(claim, range(CONNECTIONS)))
        assert sum(result["claimed"] for result in results) == 1, "Exactly one concurrent claim must win"
        assert sum(result["awardedXp"] for result in results) == 25, "Only 25 XP may be awarded"
        assert all(result["totalClaims"] == 1 and result["totalBonusXp"] == 25 and result["claimedToday"] for result in results), "Every contender must observe the same final reward"
        totals = json.loads(sql(f"""
select json_build_object(
  'ledgerRows', (select count(*) from daily_reward_private.claims where user_id='{user_id}'),
  'ledgerXp', (select sum(awarded_xp) from daily_reward_private.claims where user_id='{user_id}'),
  'claims', (select total_claims from daily_reward_private.progress where user_id='{user_id}'),
  'xp', (select total_bonus_xp from daily_reward_private.progress where user_id='{user_id}'),
  'peerRows', (select count(*) from daily_reward_private.progress where user_id='{peer_id}')
);
"""))
        assert totals == {"ledgerRows": 1, "ledgerXp": 25, "claims": 1, "xp": 25, "peerRows": 0}, "Ledger totals or peer isolation failed"
        print(json.dumps({"result": "PASS", "simultaneousConnections": CONNECTIONS, "successfulAwards": 1, "awardedXp": 25, "replayResponses": CONNECTIONS - 1, "ledgerRows": 1, "peerUnaffected": True}))
    finally:
        assert sql(cleanup).splitlines()[-2:] == ["0", "0"], "Synthetic reward fixtures were not fully cleaned"
        print("PASS: all concurrency fixtures removed")


if __name__ == "__main__":
    main()
