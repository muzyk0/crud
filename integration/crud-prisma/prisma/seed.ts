import { PrismaClientBase } from './prisma-runtime';

async function main() {
  const prisma = new PrismaClientBase();
  const deletedAt = new Date('2026-04-06T12:00:00.000Z');

  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.company.deleteMany();

  await prisma.company.createMany({
    data: [
      { id: 1, name: 'Name1', domain: 'Domain1' },
      { id: 2, name: 'Name2', domain: 'Domain2' },
      { id: 3, name: 'Name3', domain: 'Domain3' },
      { id: 4, name: 'Name4', domain: 'Domain4' },
      { id: 5, name: 'Name5', domain: 'Domain5' },
      { id: 6, name: 'Name6', domain: 'Domain6' },
      { id: 7, name: 'Name7', domain: 'Domain7' },
      { id: 8, name: 'Name8', domain: 'Domain8' },
      { id: 9, name: 'Name9', domain: 'Domain9', deletedAt },
      { id: 10, name: 'Name10', domain: 'Domain10' },
    ],
  });

  await prisma.userProfile.createMany({
    data: Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      name: `User${index + 1}`,
    })),
  });

  await prisma.user.createMany({
    data: [
      { id: 1, email: '1@email.com', isActive: true, companyId: 1, profileId: 1, nameFirst: 'firstname1', nameLast: 'lastname1' },
      { id: 2, email: '2@email.com', isActive: true, companyId: 1, profileId: 2 },
      { id: 3, email: '3@email.com', isActive: true, companyId: 1, profileId: 3 },
      { id: 4, email: '4@email.com', isActive: true, companyId: 1, profileId: 4 },
      { id: 5, email: '5@email.com', isActive: true, companyId: 1, profileId: 5 },
      { id: 6, email: '6@email.com', isActive: true, companyId: 1, profileId: 6 },
      { id: 7, email: '7@email.com', isActive: false, companyId: 1, profileId: 7 },
      { id: 8, email: '8@email.com', isActive: false, companyId: 1, profileId: 8 },
      { id: 9, email: '9@email.com', isActive: false, companyId: 1, profileId: 9 },
      { id: 10, email: '10@email.com', isActive: true, companyId: 1, profileId: 10 },
      { id: 11, email: '11@email.com', isActive: true, companyId: 2, profileId: 11 },
      { id: 12, email: '12@email.com', isActive: true, companyId: 2, profileId: 12 },
      { id: 13, email: '13@email.com', isActive: true, companyId: 2, profileId: 13 },
      { id: 14, email: '14@email.com', isActive: true, companyId: 2, profileId: 14 },
      { id: 15, email: '15@email.com', isActive: true, companyId: 2, profileId: 15 },
      { id: 16, email: '16@email.com', isActive: true, companyId: 2, profileId: 16 },
      { id: 17, email: '17@email.com', isActive: false, companyId: 2, profileId: 17 },
      { id: 18, email: '18@email.com', isActive: false, companyId: 2, profileId: 18 },
      { id: 19, email: '19@email.com', isActive: false, companyId: 2, profileId: 19 },
      { id: 20, email: '20@email.com', isActive: false, companyId: 2, profileId: 20 },
      { id: 21, email: '21@email.com', isActive: false, companyId: 2, profileId: null },
    ],
  });

  await prisma.project.createMany({
    data: [
      { id: 1, name: 'Project1', description: 'description1', isActive: true, companyId: 1 },
      { id: 2, name: 'Project2', description: 'description2', isActive: true, companyId: 1 },
      { id: 3, name: 'Project3', description: 'description3', isActive: true, companyId: 2 },
      { id: 4, name: 'Project4', description: 'description4', isActive: true, companyId: 2 },
      { id: 5, name: 'Project5', description: 'description5', isActive: true, companyId: 3 },
      { id: 6, name: 'Project6', description: 'description6', isActive: true, companyId: 3 },
      { id: 7, name: 'Project7', description: 'description7', isActive: true, companyId: 4 },
      { id: 8, name: 'Project8', description: 'description8', isActive: true, companyId: 4 },
      { id: 9, name: 'Project9', description: 'description9', isActive: true, companyId: 5 },
      { id: 10, name: 'Project10', description: 'description10', isActive: true, companyId: 5 },
      { id: 11, name: 'Project11', description: 'description11', isActive: false, companyId: 6 },
      { id: 12, name: 'Project12', description: 'description12', isActive: false, companyId: 6 },
      { id: 13, name: 'Project13', description: 'description13', isActive: false, companyId: 7 },
      { id: 14, name: 'Project14', description: 'description14', isActive: false, companyId: 7 },
      { id: 15, name: 'Project15', description: 'description15', isActive: false, companyId: 8 },
      { id: 16, name: 'Project16', description: 'description16', isActive: false, companyId: 8 },
      { id: 17, name: 'Project17', description: 'description17', isActive: false, companyId: 9 },
      { id: 18, name: 'Project18', description: 'description18', isActive: false, companyId: 9 },
      { id: 19, name: 'Project19', description: 'description19', isActive: false, companyId: 10 },
      { id: 20, name: 'Project20', description: 'description20', isActive: false, companyId: 10 },
    ],
  });

  await prisma.project.update({
    where: { id: 1 },
    data: { users: { connect: [{ id: 1 }, { id: 2 }] } },
  });
  await prisma.project.update({
    where: { id: 2 },
    data: { users: { connect: [{ id: 2 }] } },
  });
  await prisma.project.update({
    where: { id: 3 },
    data: { users: { connect: [{ id: 3 }] } },
  });

  await prisma.$disconnect();
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
