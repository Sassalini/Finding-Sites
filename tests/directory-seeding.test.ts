import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111";
const admin = "22222222-2222-4222-8222-222222222222";

test("seeding migration, import and RLS execute in isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    // Match Supabase role/auth helpers without any remote connection or credentials.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on all functions in schema auth to anon, authenticated, service_role;
    `);
    for (const file of readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
      // gen_random_uuid is built into PostgreSQL. PGlite doesn't need pgcrypto.
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace("create extension if not exists pgcrypto;", "");
      await db.exec(sql);
    }
    await db.exec(`
      insert into auth.users(id) values ('${owner}'), ('${admin}');
      update public.profiles set role = 'admin' where id = '${admin}';
      grant usage on schema public to service_role;
      grant all on all tables in schema public to service_role;
      create role authenticator;
      grant anon, authenticated, service_role to authenticator;
      set session authorization authenticator;
    `);
    const category = (await db.query<{ id: string }>("select id from public.categories where name = 'Home & Garden'")).rows[0].id;
    const session = async (role: string, id = "") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)", [role, id]);
      await db.exec(`set role ${role}`);
    };
    const importDomain = (domain: string) => db.query<{ result: string }>(
      "select public.import_seeded_listing($1,$2,$3,$4,$5) as result", ["Example Plumbing", `https://${domain}/`, domain, category, "CC-MAIN-2026-39"],
    );

    await t.test("service import produces blank ownerless seed without accounts or subscriptions", async () => {
      await session("service_role");
      assert.equal((await importDomain("example.co.uk")).rows[0].result, "inserted");
      const row = (await db.query("select owner_id,short_description,contact_email,is_seeded,is_claimed,source,source_crawl from public.website_listings where normalized_domain='example.co.uk'")).rows[0];
      assert.deepEqual(row, { owner_id: null, short_description: "", contact_email: null, is_seeded: true, is_claimed: false, source: "common_crawl", source_crawl: "CC-MAIN-2026-39" });
      assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.billing_subscriptions")).rows[0].count, 0);
      assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.profiles")).rows[0].count, 2);
    });

    await t.test("anonymous directory RLS and stats show approved unclaimed seeds", async () => {
      await session("anon");
      assert.equal((await db.query("select id from public.website_listings")).rows.length, 1);
      await session("service_role");
      const stats = (await db.query<{ stats: { websiteCount: number } }>("select public.get_directory_stats() as stats")).rows[0].stats;
      assert.equal(stats.websiteCount, 1);
    });

    await t.test("authenticated members cannot create seeds, invoke import or take ownership", async () => {
      await session("authenticated", owner);
      await assert.rejects(importDomain("forbidden.co.uk"), /permission denied/);
      await assert.rejects(db.query("insert into public.website_listings(owner_id,category_id,name,slug,url,normalized_domain,short_description,is_seeded,source,is_claimed,source_crawl,imported_at) values ($1,$2,'Fake','fake','https://fake.co.uk/','fake.co.uk','',true,'common_crawl',false,'CC-MAIN-2026-39',now())", [owner, category]), /SEED_FIELDS_PROTECTED/);
      await db.query("update public.website_listings set owner_id=$1 where normalized_domain='example.co.uk'", [owner]);
      assert.equal((await db.query<{ owner_id: string | null }>("select owner_id from public.website_listings where normalized_domain='example.co.uk'")).rows[0].owner_id, null);
      assert.equal((await db.query<{ count: number }>("select public.count_slot_occupying_listings($1) as count", [owner])).rows[0].count, 0);
      assert.equal((await db.query<{ result: string }>("select public.get_domain_submission_conflict('www.example.co.uk') as result")).rows[0].result, "seeded");
    });

    await t.test("existing user-owned and related domains are protected, imports are idempotent", async () => {
      await session("authenticated", owner);
      await db.query("insert into public.website_listings(owner_id,category_id,name,slug,url,normalized_domain,short_description) values ($1,$2,'Owned','owned','https://shop.owned.co.uk/','shop.owned.co.uk','')", [owner, category]);
      await session("service_role");
      assert.equal((await importDomain("owned.co.uk")).rows[0].result, "duplicate");
      assert.equal((await importDomain("example.co.uk")).rows[0].result, "duplicate");
      assert.equal((await db.query<{ owner_id: string | null }>("select owner_id from public.website_listings where normalized_domain='shop.owned.co.uk'")).rows[0].owner_id, owner);
      await assert.rejects(db.query("select public.import_seeded_listing('Example','https://bad.co.uk/','bad.co.uk',gen_random_uuid(),'CC-MAIN-2026-39')"), /CATEGORY_NOT_ACTIVE/);
    });

    await t.test("raw submissions cannot overwrite seeds or bypass moderation restrictions", async () => {
      await session("authenticated", owner);
      await assert.rejects(db.query("insert into public.website_listings(owner_id,category_id,name,slug,url,normalized_domain,short_description) values ($1,$2,'Overwrite','overwrite','https://www.example.co.uk/','example.co.uk','')", [owner, category]), /already has a submission/);
      await session("service_role");
      await importDomain("restricted.co.uk");
      await db.exec("update public.website_listings set status='suspended' where normalized_domain='restricted.co.uk'");
      await session("authenticated", owner);
      assert.equal((await db.query<{ result: string }>("select public.get_domain_submission_conflict('restricted.co.uk') as result")).rows[0].result, "moderated");
      await session("service_role");
      assert.equal((await importDomain("restricted.co.uk")).rows[0].result, "duplicate");
    });

    await t.test("admin removal and restoration preserve seed eligibility; members cannot delete", async () => {
      await session("authenticated", owner);
      const seedId = (await db.query<{ id: string }>("select id from public.website_listings where normalized_domain='example.co.uk'")).rows[0].id;
      await assert.rejects(db.query("select public.admin_delete_seeded_listing($1)", [seedId]), /ADMIN_REQUIRED/);
      await session("authenticated", admin);
      await db.query("select public.admin_moderate_public_listing($1,'remove','spam',null)", [seedId]);
      await session("anon");
      assert.equal((await db.query("select id from public.website_listings where normalized_domain='example.co.uk'")).rows.length, 0);
      await session("authenticated", admin);
      assert.equal((await db.query<{ result: string }>("select public.admin_moderate_public_listing($1,'restore',null,null) as result", [seedId])).rows[0].result, "restored_public");
      await db.query("select public.admin_delete_seeded_listing($1)", [seedId]);
      await session("anon");
      assert.equal((await db.query("select id from public.website_listings where normalized_domain='example.co.uk'")).rows.length, 0);
      await session("service_role");
      assert.equal((await db.query("select id from public.listing_moderation_events where listing_id=$1", [seedId])).rows.length, 2);
    });

    await t.test("inactive categories and claimed seeds lose subscription-free public visibility", async () => {
      await session("service_role");
      await importDomain("claimed.co.uk");
      await db.query("update public.website_listings set owner_id=$1,is_claimed=true where normalized_domain='claimed.co.uk'", [owner]);
      await session("anon");
      assert.equal((await db.query("select id from public.website_listings where normalized_domain='claimed.co.uk'")).rows.length, 0);
      await session("authenticated", owner);
      assert.equal((await db.query<{ count: number }>("select public.count_slot_occupying_listings($1) as count", [owner])).rows[0].count, 2);
      await session("service_role");
      await importDomain("inactive.co.uk");
      await assert.rejects(db.query("update public.website_listings set owner_id=$1,is_claimed=true where normalized_domain='inactive.co.uk'", [owner]), /LISTING_LIMIT_REACHED/);
      await db.query("update public.categories set is_active=false where id=$1", [category]);
      await session("anon");
      assert.equal((await db.query("select id from public.website_listings where normalized_domain='inactive.co.uk'")).rows.length, 0);
    });
  } finally {
    await db.close();
  }
});
