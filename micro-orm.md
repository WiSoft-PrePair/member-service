# MikroORM with NestJS 가이드

MikroORM은 **Unit of Work**, **Identity Map** 패턴을 내장한 TypeScript ORM으로, DDD(Domain-Driven Design) 구현에 적합합니다.

---

## 목차

1. [설치](#1-설치)
2. [NestJS 모듈 설정](#2-nestjs-모듈-설정)
3. [Entity 정의](#3-entity-정의)
4. [관계(Relations) 설정](#4-관계relations-설정)
5. [Repository 사용](#5-repository-사용)
6. [EntityManager 사용법](#6-entitymanager-사용법)
7. [CLI 도구](#7-cli-도구)
8. [Request Context](#8-request-context)
9. [고급 기능](#9-고급-기능)
10. [DDD 패턴 적용](#10-ddd-패턴-적용)

---

## 1. 설치

### 패키지 설치

```bash
# PostgreSQL 사용 시
pnpm add @mikro-orm/core @mikro-orm/nestjs @mikro-orm/postgresql

# MySQL/MariaDB 사용 시
pnpm add @mikro-orm/core @mikro-orm/nestjs @mikro-orm/mysql

# SQLite 사용 시
pnpm add @mikro-orm/core @mikro-orm/nestjs @mikro-orm/sqlite

# MongoDB 사용 시
pnpm add @mikro-orm/core @mikro-orm/nestjs @mikro-orm/mongodb

# CLI 도구 (개발 의존성)
pnpm add -D @mikro-orm/cli @mikro-orm/migrations @mikro-orm/seeder
```

### TypeScript 설정

`tsconfig.json`에서 데코레이터 지원 활성화:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "strict": true
  }
}
```

---

## 2. NestJS 모듈 설정

### 방법 1: 직접 설정

```typescript
// app.module.ts
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: PostgreSqlDriver,
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'password',
      dbName: 'my-database',
      entities: ['./dist/**/*.entity.js'],
      entitiesTs: ['./src/**/*.entity.ts'],
      debug: process.env.NODE_ENV !== 'production',
    }),
  ],
})
export class AppModule {}
```

### 방법 2: 설정 파일 분리 (권장)

```typescript
// mikro-orm.config.ts
import { defineConfig } from '@mikro-orm/postgresql';

export default defineConfig({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  dbName: process.env.DB_NAME || 'my-database',
  entities: ['./dist/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],
  debug: process.env.NODE_ENV !== 'production',
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
  },
});
```

```typescript
// app.module.ts
import { MikroOrmModule } from '@mikro-orm/nestjs';

@Module({
  imports: [
    MikroOrmModule.forRoot(), // 설정 파일 자동 로드
  ],
})
export class AppModule {}
```

### 방법 3: 비동기 설정 (ConfigService 사용)

```typescript
// app.module.ts
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MikroOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        driver: PostgreSqlDriver,
        host: config.get('DB_HOST'),
        port: config.get('DB_PORT'),
        user: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        dbName: config.get('DB_NAME'),
        entities: ['./dist/**/*.entity.js'],
        entitiesTs: ['./src/**/*.entity.ts'],
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class AppModule {}
```

---

## 3. Entity 정의

### 기본 Entity

```typescript
// member.ts
import { Entity, PrimaryKey, Property, Opt } from '@mikro-orm/core';

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  email!: string;

  @Property()
  name!: string;

  @Property({ nullable: true })
  bio?: string;

  @Property()
  createdAt: Date & Opt = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date & Opt = new Date();

  constructor(email: string, name: string) {
    this.email = email;
    this.name = name;
  }
}
```

### UUID 기본 키

```typescript
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 } from 'uuid';

@Entity()
export class Article {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @Property()
  title!: string;
}
```

### BigInt 기본 키

```typescript
@Entity()
export class LargeTable {
  @PrimaryKey()
  id!: bigint;
}
```

### Enum 사용

```typescript
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

export enum UserStatus {
  ACTIVE = 1,
  INACTIVE = 0,
}

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Enum(() => UserRole)
  role: UserRole = UserRole.USER;

  @Enum(() => UserStatus)
  status: UserStatus = UserStatus.ACTIVE;

  // Enum 배열
  @Enum({ items: () => UserRole, array: true })
  permissions: UserRole[] = [UserRole.USER];
}
```

### 추상 Base Entity

```typescript
// base.entity.ts
import { Entity, PrimaryKey, Property, Opt } from '@mikro-orm/core';
import { v4 } from 'uuid';

@Entity({ abstract: true })
export abstract class BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @Property()
  createdAt: Date & Opt = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date & Opt = new Date();
}

// member.ts
@Entity()
export class User extends BaseEntity {
  @Property()
  email!: string;

  @Property()
  name!: string;
}
```

---

## 4. 관계(Relations) 설정

### ManyToOne / OneToMany

```typescript
// author.entity.ts
@Entity()
export class Author {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @OneToMany(() => Book, (book) => book.author)
  books = new Collection<Book>(this);
}

// book.entity.ts
import { Entity, ManyToOne, PrimaryKey, Property, Collection } from '@mikro-orm/core';

@Entity()
export class Book {
  @PrimaryKey()
  id!: number;

  @Property()
  title!: string;

  @ManyToOne(() => Author)
  author!: Author;

  constructor(title: string, author: Author) {
    this.title = title;
    this.author = author;
  }
}
```

### OneToOne

```typescript
// member.ts
@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @OneToOne(() => Profile, (profile) => profile.user, { owner: true })
  profile?: Profile;
}

// profile.entity.ts
@Entity()
export class Profile {
  @PrimaryKey()
  id!: number;

  @Property()
  avatar!: string;

  @OneToOne(() => User, (user) => user.profile)
  user!: User;
}
```

### ManyToMany

```typescript
// book.entity.ts
@Entity()
export class Book {
  @PrimaryKey()
  id!: number;

  @Property()
  title!: string;

  @ManyToMany(() => Tag)
  tags = new Collection<Tag>(this);
}

// tag.entity.ts
@Entity()
export class Tag {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @ManyToMany(() => Book, (book) => book.tags)
  books = new Collection<Book>(this);
}
```

### mapToPk (FK만 저장)

```typescript
@Entity()
export class Comment {
  @PrimaryKey()
  id!: number;

  @Property()
  content!: string;

  // User 객체 대신 userId만 저장
  @ManyToOne(() => User, { mapToPk: true })
  userId!: number;
}
```

---

## 5. Repository 사용

### Feature 모듈에 Entity 등록

```typescript
// member.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from './member.entity';
import { UserService } from './member.service';
import { UserController } from './member.controller';

@Module({
  imports: [MikroOrmModule.forFeature([User])],
  providers: [UserService],
  controllers: [UserController],
})
export class MemberModule {}
```

### 기본 Repository 주입

```typescript
// member.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { User } from './member.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ id });
  }

  async create(email: string, name: string): Promise<User> {
    const user = new User(email, name);
    await this.userRepository.getEntityManager().persistAndFlush(user);
    return user;
  }
}
```

### 커스텀 Repository

```typescript
// member.repository.ts
import { EntityRepository } from '@mikro-orm/postgresql';
import { User } from './member.entity';

export class UserRepository extends EntityRepository<User> {
  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email });
  }

  async findActiveUsers(): Promise<User[]> {
    return this.find({ status: UserStatus.ACTIVE });
  }

  async searchByName(name: string): Promise<User[]> {
    return this.find({
      name: { $like: `%${name}%` },
    });
  }
}
```

```typescript
// member.ts
import { Entity, EntityRepositoryType } from '@mikro-orm/core';
import { UserRepository } from './member.repository';

@Entity({ repository: () => UserRepository })
export class User {
  [EntityRepositoryType]?: UserRepository;

  // ... 나머지 속성
}
```

```typescript
// member.service.ts - 커스텀 Repository 사용
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository, // 데코레이터 없이 직접 주입
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }
}
```

---

## 6. EntityManager 사용법

### 기본 CRUD

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { User } from './member.entity';

@Injectable()
export class UserService {
  constructor(private readonly em: EntityManager) {}

  // CREATE
  async create(email: string, name: string): Promise<User> {
    const user = new User(email, name);
    await this.em.persistAndFlush(user);
    return user;
  }

  // READ
  async findById(id: number): Promise<User | null> {
    return this.em.findOne(User, { id });
  }

  async findAll(): Promise<User[]> {
    return this.em.find(User, {});
  }

  // READ with relations
  async findWithBooks(id: number): Promise<User | null> {
    return this.em.findOne(User, { id }, { populate: ['books'] });
  }

  // UPDATE
  async update(id: number, data: Partial<User>): Promise<User> {
    const user = await this.em.findOneOrFail(User, { id });
    this.em.assign(user, data);
    await this.em.flush();
    return user;
  }

  // DELETE
  async delete(id: number): Promise<void> {
    const user = await this.em.findOneOrFail(User, { id });
    await this.em.removeAndFlush(user);
  }
}
```

### 복잡한 쿼리

```typescript
// QueryBuilder 사용
async findComplexQuery(): Promise<User[]> {
  const qb = this.em.createQueryBuilder(User, 'u');

  return qb
    .select('*')
    .leftJoinAndSelect('u.books', 'b')
    .where({ status: UserStatus.ACTIVE })
    .andWhere({ 'b.publishedAt': { $gte: new Date('2024-01-01') } })
    .orderBy({ createdAt: 'DESC' })
    .limit(10)
    .getResult();
}

// 필터 조건
async findWithFilters(filters: {
  name?: string;
  email?: string;
  role?: UserRole;
}): Promise<User[]> {
  const where: FilterQuery<User> = {};

  if (filters.name) {
    where.name = { $like: `%${filters.name}%` };
  }
  if (filters.email) {
    where.email = filters.email;
  }
  if (filters.role) {
    where.role = filters.role;
  }

  return this.em.find(User, where);
}
```

### 트랜잭션

```typescript
async transferMoney(fromId: number, toId: number, amount: number): Promise<void> {
  await this.em.transactional(async (em) => {
    const from = await em.findOneOrFail(Account, { id: fromId });
    const to = await em.findOneOrFail(Account, { id: toId });

    from.balance -= amount;
    to.balance += amount;

    // 자동으로 flush됨
  });
}
```

---

## 7. CLI 도구

### package.json 설정

```json
{
  "mikro-orm": {
    "useTsNode": true,
    "configPaths": [
      "./src/mikro-orm.config.ts",
      "./dist/mikro-orm.config.js"
    ]
  },
  "scripts": {
    "mikro-orm": "mikro-orm",
    "migration:create": "mikro-orm migration:create",
    "migration:up": "mikro-orm migration:up",
    "migration:down": "mikro-orm migration:down",
    "migration:pending": "mikro-orm migration:pending",
    "schema:create": "mikro-orm schema:create",
    "schema:update": "mikro-orm schema:update --safe",
    "schema:drop": "mikro-orm schema:drop",
    "seeder:run": "mikro-orm seeder:run"
  }
}
```

### 주요 CLI 명령어

```bash
# 설정 확인
npx mikro-orm debug

# 스키마 관리
npx mikro-orm schema:create    # 스키마 생성
npx mikro-orm schema:update    # 스키마 업데이트
npx mikro-orm schema:drop      # 스키마 삭제

# 마이그레이션
npx mikro-orm migration:create # 마이그레이션 파일 생성
npx mikro-orm migration:up     # 마이그레이션 실행
npx mikro-orm migration:down   # 마이그레이션 롤백
npx mikro-orm migration:pending # 대기 중인 마이그레이션 확인

# 시더
npx mikro-orm seeder:create DatabaseSeeder  # 시더 생성
npx mikro-orm seeder:run                    # 시더 실행

# 엔티티 생성 (DB에서 역공학)
npx mikro-orm generate-entities
```

---

## 8. Request Context

### NestJS 자동 설정

`@mikro-orm/nestjs`는 기본적으로 각 요청마다 EntityManager를 fork합니다.

### 큐/스케줄러에서 사용

HTTP 요청 외부(큐 핸들러, 스케줄러 등)에서는 `@CreateRequestContext()` 사용:

```typescript
import { Injectable } from '@nestjs/common';
import { CreateRequestContext, MikroORM } from '@mikro-orm/core';

@Injectable()
export class TaskService {
  constructor(private readonly orm: MikroORM) {}

  @CreateRequestContext()
  async processTask(taskId: string): Promise<void> {
    // 분리된 컨텍스트에서 실행
    const task = await this.orm.em.findOne(Task, { id: taskId });
    // ...
  }
}
```

### 수동 Fork

```typescript
async processBatch(): Promise<void> {
  const em = this.orm.em.fork();

  try {
    const items = await em.find(Item, { processed: false });
    for (const item of items) {
      item.processed = true;
    }
    await em.flush();
  } finally {
    em.clear();
  }
}
```

---

## 9. 고급 기능

### Formula (계산 필드)

```typescript
@Entity()
export class Order {
  @PrimaryKey()
  id!: number;

  @Property()
  quantity!: number;

  @Property({ type: 'decimal' })
  price!: number;

  @Formula((alias) => `${alias}.quantity * ${alias}.price`)
  totalPrice?: number;
}
```

### Index & Unique

```typescript
@Entity()
@Index({ properties: ['email'] })
@Index({ properties: ['firstName', 'lastName'] })
@Unique({ properties: ['email'] })
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  email!: string;

  @Property()
  firstName!: string;

  @Property()
  lastName!: string;
}
```

### Check Constraint

```typescript
@Entity()
@Check({ expression: 'price >= 0' })
@Check({ expression: 'quantity > 0' })
export class Product {
  @PrimaryKey()
  id!: number;

  @Property()
  price!: number;

  @Property()
  quantity!: number;
}
```

### Lazy Loading

```typescript
@Entity()
export class Article {
  @PrimaryKey()
  id!: number;

  @Property()
  title!: string;

  // 대용량 필드는 lazy로 설정
  @Property({ type: 'text', lazy: true })
  content!: string;
}

// 사용 시 명시적 로드
const article = await em.findOne(Article, { id: 1 });
await article.content.load(); // lazy 필드 로드
```

### Virtual Property

```typescript
@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  firstName!: string;

  @Property()
  lastName!: string;

  // DB에 저장되지 않는 가상 속성
  @Property({ persist: false })
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
```

### Soft Delete

```typescript
import { Entity, Filter, Property } from '@mikro-orm/core';

@Entity()
@Filter({ name: 'notDeleted', cond: { deletedAt: null }, default: true })
export class User {
  @PrimaryKey()
  id!: number;

  @Property({ nullable: true })
  deletedAt?: Date;

  softDelete(): void {
    this.deletedAt = new Date();
  }
}

// 삭제된 항목 포함 조회
const allUsers = await em.find(User, {}, { filters: { notDeleted: false } });
```

---

## 10. DDD 패턴 적용

### Domain Entity

```typescript
// domain/member/member.ts
import { Entity, PrimaryKey, Property, Embedded } from '@mikro-orm/core';
import { Email } from './value-objects/email.vo';
import { Password } from './value-objects/password.vo';

@Entity()
export class User {
  @PrimaryKey({ type: 'uuid' })
  private readonly id: string;

  @Embedded(() => Email)
  private email: Email;

  @Embedded(() => Password)
  private password: Password;

  @Property()
  private name: string;

  @Property()
  private readonly createdAt: Date;

  private constructor(id: string, email: Email, password: Password, name: string) {
    this.id = id;
    this.email = email;
    this.password = password;
    this.name = name;
    this.createdAt = new Date();
  }

  // Factory Method
  static create(id: string, email: string, password: string, name: string): User {
    return new User(
      id,
      Email.create(email),
      Password.create(password),
      name,
    );
  }

  // Domain Methods
  changeEmail(newEmail: string): void {
    this.email = Email.create(newEmail);
  }

  changeName(newName: string): void {
    if (newName.length < 2) {
      throw new Error('Name must be at least 2 characters');
    }
    this.name = newName;
  }

  // Getters
  getId(): string {
    return this.id;
  }

  getEmail(): string {
    return this.email.getValue();
  }

  getName(): string {
    return this.name;
  }
}
```

### Value Object

```typescript
// domain/member/value-objects/email.ts
import { Embeddable, Property } from '@mikro-orm/core';

@Embeddable()
export class Email {
  @Property()
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(email: string): Email {
    if (!this.isValid(email)) {
      throw new Error('Invalid email format');
    }
    return new Email(email.toLowerCase());
  }

  private static isValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
```

### Repository Interface (Port)

```typescript
// domain/member/member.repository.interface.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(user: User): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
```

### Repository Implementation (Adapter)

```typescript
// adapter/persistence/member.repository.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { User } from '../../domain/member/member.entity';
import { IUserRepository } from '../../domain/member/member.repository.interface';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<User | null> {
    return this.em.findOne(User, { id });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.em.findOne(User, { email: { value: email } });
  }

  async save(user: User): Promise<void> {
    await this.em.persistAndFlush(user);
  }

  async delete(user: User): Promise<void> {
    await this.em.removeAndFlush(user);
  }
}
```

### Application Service

```typescript
// application/member/member.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../domain/member/member.entity';
import { IUserRepository, USER_REPOSITORY } from '../../domain/member/member.repository.interface';
import { CreateUserDto } from './dto/create-member.dto';

@Injectable()
export class UserApplicationService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async createUser(dto: CreateUserDto): Promise<string> {
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    const user = User.create(
      uuidv4(),
      dto.email,
      dto.password,
      dto.name,
    );

    await this.userRepository.save(user);
    return user.getId();
  }

  async changeUserEmail(userId: string, newEmail: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.changeEmail(newEmail);
    await this.userRepository.save(user);
  }
}
```

### Module 구성

```typescript
// member.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from './domain/member/member.entity';
import { USER_REPOSITORY } from './domain/member/member.repository.interface';
import { UserRepository } from './adapter/persistence/member.repository';
import { UserApplicationService } from './application/member/member.service';
import { UserController } from './presentation/member.controller';

@Module({
  imports: [MikroOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [
    UserApplicationService,
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
  ],
  exports: [USER_REPOSITORY],
})
export class MemberModule {}
```

---
```

  DDD 폴더 구조 (Feature-based)

  src/
  ├── user/
  │   ├── domain/                    # 도메인 레이어
  │   │   ├── user.ts                # 도메인 엔티티 (Aggregate Root)
  │   │   ├── user.repository.ts     # 리포지토리 인터페이스 (Port)
  │   │   ├── enums/                 # 도메인 Enum
  │   │   │   ├── index.ts
  │   │   │   ├── job.enum.ts
  │   │   │   ├── notification.enum.ts
  │   │   │   └── frequency.enum.ts
  │   │   └── value-objects/         # 값 객체
  │   │       ├── index.ts
  │   │       └── email.ts
  │   │
  │   ├── application/               # 애플리케이션 레이어
  │   │   ├── user.service.ts        # 유스케이스
  │   │   ├── commands/              # Command (CUD)
  │   │   │   ├── create-user.command.ts
  │   │   │   └── update-user.command.ts
  │   │   └── queries/               # Query (R)
  │   │       └── get-user.query.ts
  │   │
  │   ├── infrastructure/            # 인프라 레이어
  │   │   └── user.repository.impl.ts  # 리포지토리 구현체 (Adapter)
  │   │
  │   ├── presentation/              # 프레젠테이션 레이어
  │   │   ├── user.controller.ts
  │   │   └── dto/
  │   │       ├── create-user.dto.ts
  │   │       └── user.response.dto.ts
  │   │
  │   └── member.module.ts
  │
  ├── app.module.ts
  └── main.ts

```

## 참고 자료

- [MikroORM 공식 문서](https://mikro-orm.io/docs)
- [MikroORM Quick Start](https://mikro-orm.io/docs/quick-start)
- [MikroORM NestJS Integration](https://mikro-orm.io/docs/usage-with-nestjs)
- [MikroORM Entity Definition](https://mikro-orm.io/docs/defining-entities)
- [MikroORM GitHub](https://github.com/mikro-orm/mikro-orm)
