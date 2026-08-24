# Graph Report - BTL_Mobile  (2026-08-24)

## Corpus Check
- 145 files · ~43,160 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1415 nodes · 2851 edges · 141 communities (57 shown, 84 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 171 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- CompaniesService
- Roles
- MailService
- CreateJobDto
- comments.controller.ts
- AuthService
- OnlineCVsService
- ApplicationsService
- skills.controller.ts
- Tính năng chính
- scripts
- ResponseMessage
- app.module.ts
- AIMatchingService
- LandingPage.tsx
- compilerOptions
- NotificationsController
- Subscriber
- 1. Aesthetic Excellence & Distinctive Identity (Castify-Grade UI)
- OnlineCVsController
- RedisService
- Notification
- Animation & Interaction Recipes (Castify & Fluid Motion Standards)
- customize.ts
- Frontend Design
- User
- Frontend Design & Implementation Workflow
- IUser
- passport
- eslint
- compilerOptions
- dependencies
- companies.service.ts
- CreateUserCVDto
- @nestjs/schematics
- main.ts
- Core Commands
- RegisterUserDto
- exclude
- nest-cli.json
- jobs.service.ts
- GoogleStrategy
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
- JwtStrategy
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
- axios
- @types/passport-jwt
- @types/passport-local
- Application
- @types/pg
- @types/supertest
- typescript
- @typescript-eslint/eslint-plugin
- @typescript-eslint/parser
- Design System & UI/UX Standards
- @nestjs/cli
- frontend/package.json
- Frontend & Mobile Development Skill
- Backend Architecture & NestJS Standards
- Repository Guidelines
- rules/graphify.md
- workflows/graphify.md
- CreateApplicationDto
- eslint-plugin-prettier
- README.md
- applications.service.ts
- eslint-plugin-react-refresh
- @types/bcryptjs
- @types/nodemailer
- @types/uuid
- @types/react-dom
- eslint-plugin-react-hooks
- tailwindcss
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
- `Application` --references--> `UserCV`  [EXTRACTED]
  backend/src/applications/entities/application.entity.ts → backend/src/usercvs/entities/usercv.entity.ts

## Import Cycles
- None detected.

## Communities (141 total, 84 thin omitted)

### Community 0 - "CompaniesService"
Cohesion: 0.07
Nodes (20): CompaniesController, ApiTags, Body, CacheTTL, Controller, Delete, Get, Param (+12 more)

### Community 1 - "Roles"
Cohesion: 0.09
Nodes (27): ApiQuery, ApiResponse, Roles(), Company, IsEmail, IsEnum, IsObject, IsOptional (+19 more)

### Community 2 - "MailService"
Cohesion: 0.05
Nodes (31): MailController, ApiTags, Body, Controller, Post, UseGuards, MailService, Injectable (+23 more)

### Community 3 - "CreateJobDto"
Cohesion: 0.07
Nodes (26): CreateJobDto, IsArray, IsBoolean, IsNotEmpty, IsObject, IsString, Type, ValidateNested (+18 more)

### Community 4 - "comments.controller.ts"
Cohesion: 0.07
Nodes (30): CommentsController, ApiTags, Body, CacheTTL, Controller, Delete, Get, Param (+22 more)

### Community 5 - "AuthService"
Cohesion: 0.07
Nodes (24): ApiBody, AppController, ApiTags, Controller, Get, AppService, Injectable, AuthController (+16 more)

### Community 6 - "OnlineCVsService"
Cohesion: 0.09
Nodes (21): UpdateOnlineCVDto, ActivityEntry, AwardEntry, CertificateEntry, EducationEntry, OnlineCV, SkillEntry, Column (+13 more)

### Community 7 - "ApplicationsService"
Cohesion: 0.12
Nodes (14): ApplicationsController, ApiTags, Body, Controller, Delete, Get, Param, Patch (+6 more)

### Community 8 - "skills.controller.ts"
Cohesion: 0.10
Nodes (20): CreateSkillDto, IsNotEmpty, UpdateSkillDto, SkillsController, ApiTags, Body, Controller, Delete (+12 more)

### Community 9 - "Tính năng chính"
Cohesion: 0.06
Nodes (34): 10. Comments, 1. Authentication & Authorization, 2. Quản lý Công ty (Companies), 3. Quản lý Công việc (Jobs), 4. Quản lý CV (UserCV), 5. Online CV Builder, 6. Ứng tuyển (Applications), 7. AI Matching System (+26 more)

### Community 10 - "scripts"
Cohesion: 0.06
Nodes (31): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+23 more)

### Community 11 - "ResponseMessage"
Cohesion: 0.22
Nodes (14): ResponseMessage(), ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get (+6 more)

### Community 12 - "app.module.ts"
Cohesion: 0.15
Nodes (22): AIMatchingModule, Module, ApplicationsModule, Module, AuthModule, Module, CompaniesModule, Module (+14 more)

### Community 13 - "AIMatchingService"
Cohesion: 0.06
Nodes (23): AIMatchingService, Injectable, CVProcessingProcessor, InjectRepository, CVProcessingService, Injectable, InjectRepository, CVMatchResult (+15 more)

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

### Community 19 - "OnlineCVsController"
Cohesion: 0.20
Nodes (13): OnlineCVsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get (+5 more)

### Community 20 - "RedisService"
Cohesion: 0.13
Nodes (5): Inject, InjectRepository, RedisService, Inject, Injectable

### Community 21 - "Notification"
Cohesion: 0.11
Nodes (15): Notification, Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne (+7 more)

### Community 22 - "Animation & Interaction Recipes (Castify & Fluid Motion Standards)"
Cohesion: 0.29
Nodes (6): 1. Aurora Gradient Headline, 2. Shimmer Border CTA Button, 3. 3D Perspective Browser & App Mockup, 4. Infinite Smooth Marquee with Edge Mask, 5. Bento Grid Spotlight Hover Effect, Animation & Interaction Recipes (Castify & Fluid Motion Standards)

### Community 23 - "customize.ts"
Cohesion: 0.12
Nodes (14): JwtAuthGuard, Injectable, LocalAuthGuard, Injectable, IS_PUBLIC_KEY, RESPONSE_MESSAGE, Role, ROLES_KEY (+6 more)

### Community 24 - "Frontend Design"
Cohesion: 0.29
Nodes (6): Design principles, Frontend Design, Ground it in the subject, More on writing in design, Process: brainstorm, explore, plan, critique, build, critique again, Restraint and self-critique

### Community 25 - "User"
Cohesion: 0.11
Nodes (19): CVProcessingJobData, CVProcessingStatus, InjectRepository, Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn (+11 more)

### Community 26 - "Frontend Design & Implementation Workflow"
Cohesion: 0.33
Nodes (5): Frontend Design & Implementation Workflow, Step 1: Design Plan & Tokens, Step 2: Self-Critique, Step 3: Implementation, Step 4: Quality Audit

### Community 27 - "IUser"
Cohesion: 0.18
Nodes (3): Injectable, UserCVsService, IUser

### Community 31 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+17 more)

### Community 32 - "dependencies"
Cohesion: 0.15
Nodes (13): api-query-params, dependencies, api-query-params, @nestjs/bull, @nestjs/platform-express, @nestjs/websockets, nodemailer, rxjs (+5 more)

### Community 33 - "companies.service.ts"
Cohesion: 0.20
Nodes (10): UpdateCompanyDto, CreateNotificationDto, IsEnum, IsNotEmpty, IsOptional, UpdateNotificationDto, NotificationTargetType, NotificationType (+2 more)

### Community 34 - "CreateUserCVDto"
Cohesion: 0.25
Nodes (8): CreateUserCVDto, IsArray, IsBoolean, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString

### Community 36 - "main.ts"
Cohesion: 0.25
Nodes (5): AppModule, Module, Response, TransformInterceptor, Injectable

### Community 37 - "Core Commands"
Cohesion: 0.20
Nodes (9): 1. Querying Concepts & Modules, 2. Finding Relationships & Call Paths, 3. Explaining Specific Components, 4. Discovering Architectural Hubs, 5. Keeping Graph Updated, Core Commands, Graphify Knowledge Graph Skill, Graphify Output Files (+1 more)

### Community 38 - "RegisterUserDto"
Cohesion: 0.19
Nodes (13): CreateHrDto, IsOptional, Company, CreateUserDto, RegisterUserDto, ApiProperty, IsEmail, IsEnum (+5 more)

### Community 39 - "exclude"
Cohesion: 0.25
Nodes (7): exclude, extends, dist, node_modules, **/*spec.ts, test, ./tsconfig.json

### Community 40 - "nest-cli.json"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, assets, deleteOutDir, $schema, sourceRoot

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
Nodes (9): devDependencies, eslint-config-prettier, @types/cache-manager, @types/node, @types/pdf-parse, eslint-config-prettier, @types/cache-manager, @types/node (+1 more)

### Community 91 - "devDependencies"
Cohesion: 0.13
Nodes (15): @eslint/js, devDependencies, eslint, @eslint/js, globals, @tailwindcss/vite, @types/react, typescript-eslint (+7 more)

### Community 100 - "dependencies"
Cohesion: 0.13
Nodes (15): framer-motion, dependencies, framer-motion, i18next, i18next-browser-languagedetector, lucide-react, react, react-dom (+7 more)

### Community 109 - "Application"
Cohesion: 0.08
Nodes (25): Application, Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn (+17 more)

### Community 118 - "Design System & UI/UX Standards"
Cohesion: 0.40
Nodes (4): 1. Visual Excellence & Aesthetics, 2. Layout & Spacing, 3. Micro-Interactions & Animation, Design System & UI/UX Standards

### Community 120 - "frontend/package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 121 - "Frontend & Mobile Development Skill"
Cohesion: 0.50
Nodes (3): Core Directives for the Agent, Documentation Index, Frontend & Mobile Development Skill

### Community 126 - "CreateApplicationDto"
Cohesion: 0.50
Nodes (4): CreateApplicationDto, IsMongoId, IsNotEmpty, IsOptional

### Community 128 - "README.md"
Cohesion: 0.14
Nodes (12): 1. Yêu cầu môi trường (Prerequisites), 2. Khởi chạy Hạ tầng dịch vụ (Infrastructure), 3. Khởi chạy Backend (NestJS), 4. Khởi chạy Frontend (React Vite), 📄 Bản quyền (License), 🚀 Cài đặt & Khởi chạy, 🛠 Công nghệ sử dụng, 📁 Cấu trúc thư mục (+4 more)

### Community 129 - "applications.service.ts"
Cohesion: 0.22
Nodes (6): IAIRankingResponse, ICandidateMatchResult, IsEnum, IsNotEmpty, UpdateApplicationStatusDto, ApplicationStatus

## Knowledge Gaps
- **284 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `assets` (+279 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **84 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `IUser` connect `IUser` to `CompaniesService`, `applications.service.ts`, `companies.service.ts`, `CreateJobDto`, `comments.controller.ts`, `AuthService`, `OnlineCVsService`, `ApplicationsService`, `skills.controller.ts`, `jobs.service.ts`, `Roles`, `ResponseMessage`, `AIMatchingService`, `NotificationsController`, `Subscriber`, `OnlineCVsController`, `customize.ts`, `JwtStrategy`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `RedisService` connect `RedisService` to `CompaniesService`, `companies.service.ts`, `CreateJobDto`, `jobs.service.ts`, `app.module.ts`, `Application`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `User` connect `User` to `applications.service.ts`, `companies.service.ts`, `MailService`, `comments.controller.ts`, `OnlineCVsService`, `app.module.ts`, `Application`, `AIMatchingService`, `Subscriber`, `Notification`, `customize.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _284 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CompaniesService` be split into smaller, more focused modules?**
  _Cohesion score 0.07490079365079365 - nodes in this community are weakly interconnected._
- **Should `Roles` be split into smaller, more focused modules?**
  _Cohesion score 0.08708357685563997 - nodes in this community are weakly interconnected._
- **Should `MailService` be split into smaller, more focused modules?**
  _Cohesion score 0.05101327742837177 - nodes in this community are weakly interconnected._