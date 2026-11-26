const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres123@localhost:5432/recruitment_db',
  });
  await client.connect();

  console.log('Connected to PostgreSQL database recruitment_db');

  // 2. Fetch packages
  const packagesRes = await client.query(`
    SELECT "_id", "code", "plan_type", "billing_cycle", "name", "price", "duration_days", "hot_job_limit", "candidate_search_limit"
    FROM "premium_packages"
    WHERE "is_active" = true AND "is_deleted" = false;
  `);

  console.log(`Found ${packagesRes.rows.length} active packages:`);
  console.table(packagesRes.rows);

  const hrAnnualPkg = packagesRes.rows.find(p => p._id === process.env.HR_PACKAGE_ID);
  const candAnnualPkg = packagesRes.rows.find(p => p._id === process.env.CANDIDATE_PACKAGE_ID);

  if (!hrAnnualPkg || !candAnnualPkg) {
    throw new Error('Explicit HR_PACKAGE_ID and CANDIDATE_PACKAGE_ID are required');
  }

  // 3. Find current premium users
  const usersRes = await client.query(`
    SELECT "_id", "email", "name", "role", "isPremium", "premiumPlan", "company", "premiumExpiresAt"
    FROM "users"
    WHERE "isPremium" = true;
  `);

  console.log(`Found ${usersRes.rows.length} premium users to map:`);

  for (const user of usersRes.rows) {
    const isHr = user.role === 'HR' || user.premiumPlan === 'HR_PREMIUM';
    const targetPkg = isHr ? hrAnnualPkg : candAnnualPkg;

    await client.query(`
      UPDATE "users"
      SET
        "premiumPackageId" = $1,
        "updatedAt" = NOW()
      WHERE "_id" = $2;
    `, [targetPkg._id, user._id]);

    console.log(`Mapped subscription package [${targetPkg.code}]`);

    // If HR, also ensure company is marked premium
    if (isHr && user.company && user.company._id) {
      await client.query(`
        UPDATE "companies"
        SET
          "isPremium" = true,
          "premiumExpiresAt" = $1,
          "updatedAt" = NOW()
        WHERE "_id" = $2;
      `, [user.premiumExpiresAt, user.company._id]);
      console.log(`  -> Synced Company ${user.company._id} (${user.company.name}) to isPremium = true.`);
    }
  }

  // 4. Verify results
  const updatedUsersRes = await client.query(`
    SELECT u."_id", u."email", u."role", u."isPremium", u."premiumPlan", u."premiumPackageId", p."code" as package_code, p."name" as package_name, p."hot_job_limit", p."candidate_search_limit"
    FROM "users" u
    LEFT JOIN "premium_packages" p ON u."premiumPackageId"::uuid = p."_id"
    WHERE u."isPremium" = true;
  `);

  console.log('\n--- VERIFICATION: UPDATED PREMIUM USERS & ATTACHED DB RULES ---');
  console.table(updatedUsersRes.rows);

  await client.end();
  console.log('Migration completed successfully!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
