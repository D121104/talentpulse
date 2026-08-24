# Graph Report - BTL_Mobile  (2026-08-24)

## Corpus Check
- 144 files · ~42,021 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1402 nodes · 2838 edges · 142 communities (61 shown, 81 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 171 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- CompaniesService
- UsersService
- MailService
- CreateJobDto
- comments.controller.ts
- AuthService
- OnlineCVsService
- ApplicationsService
- skills.service.ts
- Tính năng chính
- scripts
- IUser
- app.module.ts
- AIMatchingService
- LandingPage.tsx
- compilerOptions
- NotificationsController
- Subscriber
- 1. Aesthetic Excellence & Distinctive Identity (Castify-Grade UI)
- ResponseMessage
- RedisService
- Notification
- Animation & Interaction Recipes (Castify & Fluid Motion Standards)
- Roles
- Frontend Design
- User
- Frontend Design & Implementation Workflow
- CVMatchResult
- passport
- eslint
- compilerOptions
- dependencies
- applications.service.ts
- Company
- @nestjs/schematics
- main.ts
- Core Commands
- auth.service.ts
- exclude
- nest-cli.json
- Job
- auth.module.ts
- ForgotPasswordDto
- CreateOnlineCVDto
- bcryptjs
- bull
- cache-manager
- cache-manager-redis-store
- class-transformer
- class-validator
- cloudinary
- cookie-parser
- crypto
- handlebars
- hbs
- helmet
- mammoth
- ms
- @nestjs/cache-manager
- @nestjs/common
- @nestjs/config
- @nestjs/core
- @nestjs/jwt
- @nestjs/mapped-types
- @nestjs-modules/mailer
- @nestjs/passport
- @nestjs/platform-socket.io
- @nestjs/schedule
- @nestjs/swagger
- @nestjs/throttler
- @nestjs/typeorm
- FilesService
- passport-google-oauth20
- passport-jwt
- passport-local
- pdf-parse
- pg
- puppeteer
- reflect-metadata
- serve-static
- socket.io
- streamifier
- swagger-ui-express
- typeorm
- uuid
- @xenova/transformers
- Repository Agent Guidelines & Standards
- eslint-config-prettier
- jest
- devDependencies
- devDependencies
- @nestjs/testing
- prettier
- source-map-support
- supertest
- ts-jest
- ts-loader
- ts-node
- tsconfig-paths
- dependencies
- @types/cookie-parser
- @types/express
- @types/jest
- @types/ms
- @types/multer
- CVProcessingService
- @types/passport-jwt
- @types/passport-local
- Application
- @types/pg
- @types/supertest
- typescript
- @typescript-eslint/eslint-plugin
- @typescript-eslint/parser
- Design System & UI/UX Standards
- users.service.ts
- frontend/package.json
- Frontend & Mobile Development Skill
- Backend Architecture & NestJS Standards
- Repository Guidelines
- rules/graphify.md
- workflows/graphify.md
- CreateApplicationDto
- eslint-plugin-prettier
- UpdateApplicationStatusDto
- api-query-params
- @types/bcryptjs
- @types/nodemailer
- @types/uuid
- @eslint/js
- eslint-plugin-react-hooks
- tailwindcss
- @tailwindcss/vite
- typescript
- vite

## God Nodes (most connected - your core abstractions)
1. `IUser` - 145 edges
2. `Roles()` - 46 edges
3. `UsersService` - 43 edges
4. `ResponseMessage()` - 39 edges
5. `User` - 29 edges
6. `CompaniesService` - 28 edges
7. `RedisService` - 28 edges
8. `AIMatchingService` - 24 edges
9. `CVMatchResult` - 24 edges
10. `CompaniesController` - 22 edges

## Surprising Connections (you probably didn't know these)
- `CVMatchResult` --references--> `Application`  [EXTRACTED]
  backend/src/ai-matching/entities/cv-match-result.entity.ts → backend/src/applications/entities/application.entity.ts
- `CVMatchResult` --references--> `Job`  [EXTRACTED]
  backend/src/ai-matching/entities/cv-match-result.entity.ts → backend/src/jobs/entities/job.entity.ts
- `CVMatchResult` --references--> `UserCV`  [EXTRACTED]
  backend/src/ai-matching/entities/cv-match-result.entity.ts → backend/src/usercvs/entities/usercv.entity.ts
- `CVMatchResult` --references--> `User`  [EXTRACTED]
  backend/src/ai-matching/entities/cv-match-result.entity.ts → backend/src/users/entities/user.entity.ts
- `Application` --references--> `Company`  [EXTRACTED]
  backend/src/applications/entities/application.entity.ts → backend/src/companies/entities/company.entity.ts

## Import Cycles
- None detected.

## Communities (142 total, 81 thin omitted)

### Community 0 - "CompaniesService"
Cohesion: 0.07
Nodes (21): CompaniesController, ApiTags, Body, CacheTTL, Controller, Delete, Get, Param (+13 more)

### Community 1 - "UsersService"
Cohesion: 0.10
Nodes (18): ApiQuery, ApiResponse, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete (+10 more)

### Community 2 - "MailService"
Cohesion: 0.05
Nodes (29): MailController, ApiTags, Body, Controller, Post, UseGuards, MailService, Injectable (+21 more)

### Community 3 - "CreateJobDto"
Cohesion: 0.07
Nodes (26): CreateJobDto, IsArray, IsBoolean, IsNotEmpty, IsObject, IsString, Type, ValidateNested (+18 more)

### Community 4 - "comments.controller.ts"
Cohesion: 0.07
Nodes (30): CommentsController, ApiTags, Body, CacheTTL, Controller, Delete, Get, Param (+22 more)

### Community 5 - "AuthService"
Cohesion: 0.07
Nodes (25): ApiBody, AppController, ApiTags, Controller, Get, AppService, Injectable, AuthController (+17 more)

### Community 6 - "OnlineCVsService"
Cohesion: 0.09
Nodes (19): UpdateOnlineCVDto, ActivityEntry, AwardEntry, CertificateEntry, EducationEntry, OnlineCV, SkillEntry, Column (+11 more)

### Community 7 - "ApplicationsService"
Cohesion: 0.13
Nodes (14): ApplicationsController, ApiTags, Body, Controller, Delete, Get, Param, Patch (+6 more)

### Community 8 - "skills.service.ts"
Cohesion: 0.09
Nodes (20): CreateSkillDto, IsNotEmpty, UpdateSkillDto, SkillsController, ApiTags, Body, Controller, Delete (+12 more)

### Community 9 - "Tính năng chính"
Cohesion: 0.06
Nodes (34): 10. Comments, 1. Authentication & Authorization, 2. Quản lý Công ty (Companies), 3. Quản lý Công việc (Jobs), 4. Quản lý CV (UserCV), 5. Online CV Builder, 6. Ứng tuyển (Applications), 7. AI Matching System (+26 more)

### Community 10 - "scripts"
Cohesion: 0.06
Nodes (31): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+23 more)

### Community 11 - "IUser"
Cohesion: 0.12
Nodes (16): ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get, Param (+8 more)

### Community 12 - "app.module.ts"
Cohesion: 0.15
Nodes (22): AIMatchingModule, Module, ApplicationsModule, Module, AuthModule, Module, JobsModule, Module (+14 more)

### Community 13 - "AIMatchingService"
Cohesion: 0.08
Nodes (16): AIMatchingService, Injectable, CVProcessingProcessor, InjectRepository, CreateUserCVDto, IsArray, IsBoolean, IsEnum (+8 more)

### Community 14 - "LandingPage.tsx"
Cohesion: 0.06
Nodes (28): App(), AIFeatures(), CTABanner(), FeaturedJobs(), mockJobs, HeroSection(), candidateIcons, employerIcons (+20 more)

### Community 15 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+15 more)

### Community 16 - "NotificationsController"
Cohesion: 0.13
Nodes (11): NotificationsController, ApiTags, Controller, Delete, Get, Param, Patch, Post (+3 more)

### Community 17 - "Subscriber"
Cohesion: 0.05
Nodes (41): Skill, Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, CreateSubscriberDto (+33 more)

### Community 18 - "1. Aesthetic Excellence & Distinctive Identity (Castify-Grade UI)"
Cohesion: 0.25
Nodes (7): 1. Aesthetic Excellence & Distinctive Identity (Castify-Grade UI), 2. Strict UI Rules & Anti-Patterns (UI-UX Pro Max Checklist), 3. Pre-Delivery Audit Checklist, A. The Thesis Hero & 3D Perspective, B. Bento Grid Layouts, C. Motion & Infinite Smooth Scroll, Frontend & Mobile Design Rules (Pro Max Standard)

### Community 19 - "ResponseMessage"
Cohesion: 0.28
Nodes (14): ResponseMessage(), OnlineCVsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete (+6 more)

### Community 20 - "RedisService"
Cohesion: 0.16
Nodes (3): RedisService, Inject, Injectable

### Community 21 - "Notification"
Cohesion: 0.11
Nodes (15): Notification, Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne (+7 more)

### Community 22 - "Animation & Interaction Recipes (Castify & Fluid Motion Standards)"
Cohesion: 0.29
Nodes (6): 1. Aurora Gradient Headline, 2. Shimmer Border CTA Button, 3. 3D Perspective Browser & App Mockup, 4. Infinite Smooth Marquee with Edge Mask, 5. Bento Grid Spotlight Hover Effect, Animation & Interaction Recipes (Castify & Fluid Motion Standards)

### Community 23 - "Roles"
Cohesion: 0.25
Nodes (10): JwtAuthGuard, Injectable, IS_PUBLIC_KEY, RESPONSE_MESSAGE, Role, Roles(), ROLES_KEY, User (+2 more)

### Community 24 - "Frontend Design"
Cohesion: 0.29
Nodes (6): Design principles, Frontend Design, Ground it in the subject, More on writing in design, Process: brainstorm, explore, plan, critique, build, critique again, Restraint and self-critique

### Community 25 - "User"
Cohesion: 0.13
Nodes (16): Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn (+8 more)

### Community 26 - "Frontend Design & Implementation Workflow"
Cohesion: 0.33
Nodes (5): Frontend Design & Implementation Workflow, Step 1: Design Plan & Tokens, Step 2: Self-Critique, Step 3: Implementation, Step 4: Quality Audit

### Community 27 - "CVMatchResult"
Cohesion: 0.15
Nodes (12): CVProcessingJobData, CVMatchResult, CVProcessingStatus, Column, CreateDateColumn, DeleteDateColumn, Entity, Index (+4 more)

### Community 31 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+17 more)

### Community 32 - "dependencies"
Cohesion: 0.15
Nodes (13): axios, dependencies, axios, @nestjs/bull, @nestjs/platform-express, @nestjs/websockets, nodemailer, rxjs (+5 more)

### Community 33 - "applications.service.ts"
Cohesion: 0.19
Nodes (12): IAIRankingResponse, ICandidateMatchResult, UpdateJobDto, CreateNotificationDto, IsEnum, IsNotEmpty, IsOptional, UpdateNotificationDto (+4 more)

### Community 34 - "Company"
Cohesion: 0.14
Nodes (11): Inject, InjectRepository, Company, Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn (+3 more)

### Community 36 - "main.ts"
Cohesion: 0.25
Nodes (5): AppModule, Module, Response, TransformInterceptor, Injectable

### Community 37 - "Core Commands"
Cohesion: 0.20
Nodes (9): 1. Querying Concepts & Modules, 2. Finding Relationships & Call Paths, 3. Explaining Specific Components, 4. Discovering Architectural Hubs, 5. Keeping Graph Updated, Core Commands, Graphify Knowledge Graph Skill, Graphify Output Files (+1 more)

### Community 38 - "auth.service.ts"
Cohesion: 0.19
Nodes (15): LocalAuthGuard, Injectable, CreateHrDto, IsOptional, Company, CreateUserDto, RegisterUserDto, ApiProperty (+7 more)

### Community 39 - "exclude"
Cohesion: 0.25
Nodes (7): exclude, extends, dist, node_modules, **/*spec.ts, test, ./tsconfig.json

### Community 40 - "nest-cli.json"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, assets, deleteOutDir, $schema, sourceRoot

### Community 41 - "Job"
Cohesion: 0.27
Nodes (7): Job, Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn

### Community 42 - "auth.module.ts"
Cohesion: 0.18
Nodes (6): GoogleStrategy, Injectable, JwtStrategy, Injectable, CompaniesModule, Module

### Community 43 - "ForgotPasswordDto"
Cohesion: 0.50
Nodes (3): ForgotPasswordDto, IsEmail, IsNotEmpty

### Community 44 - "CreateOnlineCVDto"
Cohesion: 0.23
Nodes (17): ApiPropertyOptional, ActivityEntryDto, AwardEntryDto, CertificateEntryDto, CreateOnlineCVDto, EducationEntryDto, SkillEntryDto, ApiProperty (+9 more)

### Community 72 - "FilesService"
Cohesion: 0.15
Nodes (11): CloudinaryProvider, FilesController, ApiTags, Controller, Post, FilesModule, Module, FilesService (+3 more)

### Community 87 - "Repository Agent Guidelines & Standards"
Cohesion: 0.40
Nodes (4): 1. MANDATORY: Graphify-First Codebase Exploration (Token Optimization), 2. Workspace Skills Catalog, 3. General Development Rules, Repository Agent Guidelines & Standards

### Community 90 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, @nestjs/cli, @types/cache-manager, @types/node, @types/pdf-parse, @nestjs/cli, @types/cache-manager, @types/node (+1 more)

### Community 91 - "devDependencies"
Cohesion: 0.13
Nodes (15): eslint-plugin-react-refresh, devDependencies, eslint, eslint-plugin-react-refresh, globals, @types/react, @types/react-dom, typescript-eslint (+7 more)

### Community 100 - "dependencies"
Cohesion: 0.13
Nodes (15): framer-motion, dependencies, framer-motion, i18next, i18next-browser-languagedetector, lucide-react, react, react-dom (+7 more)

### Community 106 - "CVProcessingService"
Cohesion: 0.15
Nodes (6): CVProcessingService, Injectable, InjectRepository, Inject, InjectRepository, InjectQueue

### Community 109 - "Application"
Cohesion: 0.17
Nodes (11): Inject, InjectRepository, Application, Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn (+3 more)

### Community 118 - "Design System & UI/UX Standards"
Cohesion: 0.40
Nodes (4): 1. Visual Excellence & Aesthetics, 2. Layout & Spacing, 3. Micro-Interactions & Animation, Design System & UI/UX Standards

### Community 119 - "users.service.ts"
Cohesion: 0.21
Nodes (10): Company, IsEmail, IsEnum, IsNotEmpty, IsObject, IsOptional, Type, ValidateNested (+2 more)

### Community 120 - "frontend/package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 121 - "Frontend & Mobile Development Skill"
Cohesion: 0.50
Nodes (3): Core Directives for the Agent, Documentation Index, Frontend & Mobile Development Skill

### Community 126 - "CreateApplicationDto"
Cohesion: 0.40
Nodes (4): CreateApplicationDto, IsMongoId, IsNotEmpty, IsOptional

### Community 129 - "UpdateApplicationStatusDto"
Cohesion: 0.50
Nodes (4): IsEnum, IsNotEmpty, UpdateApplicationStatusDto, ApplicationStatus

## Knowledge Gaps
- **274 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `assets` (+269 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **81 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `IUser` connect `IUser` to `CompaniesService`, `applications.service.ts`, `UsersService`, `CreateJobDto`, `comments.controller.ts`, `AuthService`, `auth.service.ts`, `ApplicationsService`, `OnlineCVsService`, `skills.service.ts`, `CVProcessingService`, `auth.module.ts`, `AIMatchingService`, `NotificationsController`, `Subscriber`, `ResponseMessage`, `users.service.ts`, `Roles`?**
  _High betweenness centrality (0.161) - this node is a cross-community bridge._
- **Why does `RedisService` connect `RedisService` to `CompaniesService`, `applications.service.ts`, `Company`, `CreateJobDto`, `CVProcessingService`, `app.module.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `User` connect `User` to `applications.service.ts`, `Company`, `comments.controller.ts`, `AuthService`, `auth.service.ts`, `OnlineCVsService`, `auth.module.ts`, `app.module.ts`, `Application`, `Subscriber`, `users.service.ts`, `Notification`, `Roles`, `CVMatchResult`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _274 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CompaniesService` be split into smaller, more focused modules?**
  _Cohesion score 0.06777493606138107 - nodes in this community are weakly interconnected._
- **Should `UsersService` be split into smaller, more focused modules?**
  _Cohesion score 0.09503843466107617 - nodes in this community are weakly interconnected._
- **Should `MailService` be split into smaller, more focused modules?**
  _Cohesion score 0.05411764705882353 - nodes in this community are weakly interconnected._