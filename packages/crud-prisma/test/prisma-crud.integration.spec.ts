import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { RequestQueryBuilder } from '@nestjsx/crud-request';
import * as request from 'supertest';
import { parse } from 'qs';

import { HttpExceptionFilter } from '../../../integration/shared/https-exception.filter';
import { preparePrismaIntegrationDatabase } from '../../../integration/crud-prisma/prisma/prepare';

jest.setTimeout(180000);

function buildQuery(build: (qb: RequestQueryBuilder) => RequestQueryBuilder): Record<string, unknown> {
  return parse(build(RequestQueryBuilder.create()).query(false));
}

async function createIntegrationApp(): Promise<INestApplication> {
  await preparePrismaIntegrationDatabase();
  const { AppModule } = await import('../../../integration/crud-prisma/app.module');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  return app;
}

describe('#crud-prisma', () => {
  describe('#integration contract', () => {
    describe('#read scenarios', () => {
      let app: INestApplication;
      let server: request.SuperTest<request.Test>;
      let companiesService: any;

      beforeAll(async () => {
        const { CompaniesService } = await import('../../../integration/crud-prisma/companies/companies.service');

        app = await createIntegrationApp();
        server = request(app.getHttpServer());
        companiesService = app.get(CompaniesService);
      });

      afterAll(async () => {
        await app.close();
      });

      it('should match paginated companies over HTTP and service-level counts', async () => {
        const query = buildQuery((qb) => qb.setLimit(3).setPage(1).sortBy({ field: 'id', order: 'DESC' }));
        const res = await server.get('/companies').query(query).expect(200);

        await expect(companiesService.count({ where: { deletedAt: null } })).resolves.toBe(9);
        expect(res.body).toMatchObject({
          count: 3,
          total: 9,
          page: 1,
          pageCount: 3,
        });
        expect(res.body.data.map((company: { id: number }) => company.id)).toEqual([10, 8, 7]);
      });

      it('should include soft-deleted rows only when include_deleted is present', async () => {
        const active = await server.get('/companies').expect(200);
        const all = await server.get('/companies?include_deleted=1').expect(200);

        expect(active.body).toHaveLength(9);
        expect(all.body).toHaveLength(10);
        expect(active.body.some((company: { id: number }) => company.id === 9)).toBe(false);
        expect(all.body.filter((company: { deletedAt: string | null }) => !!company.deletedAt)).toHaveLength(1);
        expect(all.body.filter((company: { id: number }) => company.id === 9)).toHaveLength(1);
        expect(all.body.some((company: { id: number }) => company.id === 9)).toBe(true);
      });

      it('should load joins with excluded fields on the top-level users route', async () => {
        const query = buildQuery((qb) => qb.setJoin({ field: 'company' }).setJoin({ field: 'company.projects' }));
        const res = await server.get('/users/1').query(query).expect(200);

        expect(res.body.id).toBe(1);
        expect(res.body.profile).toMatchObject({ id: 1, name: 'User1' });
        expect(res.body.company).toBeDefined();
        expect(res.body.company.description).toBeUndefined();
        expect(res.body.company.projects).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })]),
        );
        expect(res.body.company.projects.every((project: { description?: string }) => project.description === undefined)).toBe(
          true,
        );
      });

      it('should support search and nested sorting on joined user relations', async () => {
        const query = buildQuery((qb) =>
          qb
            .search({ email: { $starts: '2' } })
            .setJoin({ field: 'company' })
            .sortBy({ field: 'company.id', order: 'DESC' }),
        );
        const res = await server.get('/users').query(query).expect(200);

        expect(res.body).toHaveLength(3);
        expect(res.body.map((user: { company: { id: number } }) => user.company.id)).toEqual([2, 2, 1]);
      });

      it('should distinguish required and optional joins', async () => {
        await server.get('/users2/21').expect(404);

        const optional = await server.get('/users3/21').expect(200);
        expect(optional.body).toMatchObject({ id: 21, profile: null });
      });
    });

    describe('#mutation scenarios', () => {
      let app: INestApplication;
      let server: request.SuperTest<request.Test>;

      beforeAll(async () => {
        app = await createIntegrationApp();
        server = request(app.getHttpServer());
      });

      afterAll(async () => {
        await app.close();
      });

      it('should create, update, soft delete, and recover companies', async () => {
        const created = await server
          .post('/companies')
          .send({
            name: 'Prisma Contract',
            domain: 'prisma-contract',
          })
          .expect(201);

        const updated = await server
          .patch(`/companies/${created.body.id}`)
          .send({
            description: 'updated through prisma integration',
          })
          .expect(200);

        await server.delete(`/companies/${created.body.id}`).expect(200);
        await server.get(`/companies/${created.body.id}`).expect(404);

        const recovered = await server.patch(`/companies/${created.body.id}/recover`).expect(200);
        const fetched = await server.get(`/companies/${created.body.id}`).expect(200);

        expect(updated.body.description).toBe('updated through prisma integration');
        expect(recovered.body.id).toBe(created.body.id);
        expect(fetched.body.description).toBe('updated through prisma integration');
      });

      it('should create many companies in bulk', async () => {
        const res = await server
          .post('/companies/bulk')
          .send({
            bulk: [
              {
                name: 'Bulk Prisma 1',
                domain: 'bulk-prisma-1',
              },
              {
                name: 'Bulk Prisma 2',
                domain: 'bulk-prisma-2',
              },
            ],
          })
          .expect(201);

        expect(res.body).toHaveLength(2);
        expect(res.body[0].id).toBeTruthy();
        expect(res.body[1].id).toBeTruthy();
      });

      it('should enforce params filters and return deleted users', async () => {
        const created = await server
          .post('/companies/1/users')
          .send({
            email: 'scoped-user@email.com',
            isActive: true,
          })
          .expect(201);

        const updated = await server
          .patch(`/companies/1/users/${created.body.id}`)
          .send({
            companyId: 2,
            isActive: false,
          })
          .expect(200);

        const deleted = await server.delete(`/companies/1/users/${created.body.id}`).expect(200);

        expect(created.body.companyId).toBe(1);
        expect(updated.body.companyId).toBe(1);
        expect(updated.body.isActive).toBe(false);
        expect(deleted.body).toMatchObject({
          id: created.body.id,
          companyId: 1,
        });
      });

      it.skip('should require explicit normalizers for nested relation writes (first-version non-goal)', async () => {});
    });

    describe('#auth scenarios', () => {
      let app: INestApplication;
      let server: request.SuperTest<request.Test>;
      let projectsService: any;

      beforeAll(async () => {
        const { ProjectsService } = await import('../../../integration/crud-prisma/projects/projects.service');

        app = await createIntegrationApp();
        server = request(app.getHttpServer());
        projectsService = app.get(ProjectsService);
      });

      afterAll(async () => {
        await app.close();
      });

      it('should apply auth persist on the me route', async () => {
        const me = await server.get('/me').expect(200);
        const updated = await server
          .patch('/me')
          .send({
            email: 'override@email.com',
            isActive: false,
          })
          .expect(200);

        expect(me.body).toMatchObject({
          id: 1,
          company: {
            id: 1,
          },
          profile: {
            id: 1,
          },
        });
        expect(updated.body.id).toBe(1);
        expect(updated.body.email).toBe('1@email.com');
        expect(updated.body.isActive).toBe(false);
      });

      it('should enforce auth persist and auth filters on projects', async () => {
        const created = await server
          .post('/projects')
          .send({
            name: 'Auth Prisma Project',
            description: 'created with auth persist',
            isActive: false,
            companyId: 10,
          })
          .expect(201);

        await server.delete(`/projects/${created.body.id}`).expect(200);
        await server.delete('/projects/20').expect(404);
        await expect(
          projectsService.findOne({
            select: {
              id: true,
              name: true,
              description: true,
              isActive: true,
              companyId: true,
            },
            where: { id: created.body.id },
          }),
        ).resolves.toBeNull();

        expect(created.body.companyId).toBe(1);
      });
    });
  });
});
