import 'dotenv/config';
import dataSource from '../database/data-source';
import { Company } from '../companies/entities/company.entity';

async function run() {
  console.log('Connecting to database...');
  await dataSource.initialize();
  const companyRepo = dataSource.getRepository(Company);

  const updates = [
    {
      name: 'TalentPulse Technology Group',
      lat: 21.0173,
      lon: 105.7838,
      website: 'https://talentpulse.vn',
    },
    {
      name: 'GrandLand Real Estate & Commercial Group',
      lat: 10.7716,
      lon: 106.7044,
      website: 'https://grandland.vn',
    },
    {
      name: 'CreativePulse Digital & Media Agency',
      lat: 21.0084,
      lon: 105.7972,
      website: 'https://creativepulse.vn',
    },
  ];

  for (const item of updates) {
    const company = await companyRepo.findOne({ where: { name: item.name } });
    if (company) {
      company.lat = item.lat;
      company.lon = item.lon;
      company.website = item.website;
      await companyRepo.save(company);
      console.log(`Updated coordinates for ${item.name}: lat=${item.lat}, lon=${item.lon}`);
    } else {
      console.log(`Company not found: ${item.name}`);
    }
  }

  await dataSource.destroy();
  console.log('Done!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
