---
name: backend
description: Backend architectural patterns, NestJS conventions, TypeORM PostgreSQL integration, Redis caching, Elasticsearch indexing, Bull queue workflows, and REST/WebSocket API design.
---

# Backend Architecture & NestJS Standards

This skill defines backend guidelines, coding standards, and architectural patterns for the NestJS PostgreSQL microservice/monolith stack.

## Architecture Layers
1. **Entities (`*.entity.ts`)**:
   - TypeORM entities with UUID primary keys (`@PrimaryGeneratedColumn('uuid') _id: string`).
   - Soft deletes with `@DeleteDateColumn() deletedAt: Date;` and `@Column({ default: false }) isDeleted: boolean;`.
   - JSONB columns for nested data (`@Column({ type: 'jsonb', nullable: true })`).
2. **DTOs (`*.dto.ts`)**:
   - Strictly validate all inputs using `class-validator` and `class-transformer`.
   - Use Swagger decorators (`@ApiProperty()`, `@ApiTags()`) for API documentation.
3. **Services (`*.service.ts`)**:
   - Business logic encapsulated within services.
   - Inject TypeORM repositories via `@InjectRepository(Entity)`.
   - Invalidate or update Redis cache on data mutations.
4. **Controllers (`*.controller.ts`)**:
   - Route handling, parameter extraction, and authorization guards (`@UseGuards(JwtAuthGuard, RolesGuard)`).
5. **Queues & Asynchronous Jobs**:
   - Use `@Processor('queue-name')` and `@Process('job-name')` with Bull for long-running or AI matching tasks.
